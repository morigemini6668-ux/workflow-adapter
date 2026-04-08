import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { agentsDir, sessionDir, logsDir } from '../lib/constants.js';
import type { CliType } from '../lib/types.js';
import {
  type SessionContext,
  loadSession,
  updateSession,
  listAgents,
  readAgentState,
  writeAgentState,
  OutboxReader,
  listTasks,
  writeTask,
  appendEvent,
} from './state.js';
import { isPaneDead, detectState, createPane, waitForReady, startPaneLog } from './tmux.js';
import { dispatchTask, nudgeAgent, type DispatchTarget } from './dispatch.js';
import { loadAndRenderTemplate, buildOrchestratorVars } from '../launch/index.js';

// ── Monitor ──────────────────────────────────────────────────────────

export interface MonitorOptions {
  healthPollMs: number;      // Default: 5000
  nudgeDelayMs: number;      // Default: 30000
  nudgeMaxCount: number;     // Default: 3
  onSpawn?: (name: string, cli: CliType, role: string) => Promise<void>;
}

interface AgentIdleTracker {
  idleSince: number | null;
}

export interface MonitorHandle {
  stop(): void;
}

/**
 * Start the daemon monitoring loop.
 *
 * Responsibilities:
 * - Health check every healthPollMs (pane alive, status polling)
 * - Idle nudge after nudgeDelayMs
 * - Orchestrator crash → auto-respawn + recovery inbox
 * - Outbox cursor check for new results → update task statuses
 * - fs.watch for real-time status change detection
 */
export function startMonitor(
  ctx: SessionContext,
  outboxReader: OutboxReader,
  opts: MonitorOptions,
): MonitorHandle {
  const idleTrackers = new Map<string, AgentIdleTracker>();
  let healthTimer: Timer | null = null;
  let fsWatcher: FSWatcher | null = null;
  let stopped = false;

  // ── Health check loop ──────────────────────────────────────────────
  async function healthCheck(): Promise<void> {
    if (stopped) return;

    try {
      const agents = await listAgents(ctx);

      for (const agent of agents) {
        // 1. Check pane alive
        const dead = await isPaneDead(agent.pane_id);
        if (dead) {
          await handleCrash(ctx, agent.name, agent.cli, agent.role);
          continue;
        }

        // 2. Read current state from agent file
        try {
          const current = await readAgentState(ctx, agent.name);

          // 3. Idle nudge check
          if (current.state === 'idle') {
            await checkIdleNudge(ctx, agent.name, current, opts);
          } else {
            // Reset idle tracker when not idle
            const tracker = idleTrackers.get(agent.name);
            if (tracker) tracker.idleSince = null;
          }
        } catch {
          // Agent state file might be in mid-write; skip this cycle
        }
      }

      // 4. Check outbox for new results
      await processOutbox(ctx, outboxReader);

      // 5. Check dependency resolution
      await resolveDependencies(ctx);
    } catch (err) {
      console.error('[monitor] health check error:', err);
    }

    // Schedule next check
    if (!stopped) {
      healthTimer = setTimeout(healthCheck, opts.healthPollMs);
    }
  }

  // ── Crash handling ─────────────────────────────────────────────────
  async function handleCrash(
    ctx: SessionContext,
    name: string,
    cli: CliType,
    role: string,
  ): Promise<void> {
    await appendEvent(ctx, 'agent_crashed', { agent: name });

    if (role === 'orchestrator') {
      // Auto-respawn orchestrator (D14)
      console.log(`[monitor] Orchestrator ${name} crashed — auto-respawning`);
      try {
        await respawnOrchestrator(ctx, name, cli);
      } catch (err) {
        console.error('[monitor] Failed to respawn orchestrator:', err);
      }
    }
    // For workers: just log. Orchestrator handles via status check.
  }

  // ── Idle nudge ─────────────────────────────────────────────────────
  async function checkIdleNudge(
    ctx: SessionContext,
    name: string,
    agent: Awaited<ReturnType<typeof readAgentState>>,
    opts: MonitorOptions,
  ): Promise<void> {
    let tracker = idleTrackers.get(name);
    if (!tracker) {
      tracker = { idleSince: null };
      idleTrackers.set(name, tracker);
    }

    if (tracker.idleSince === null) {
      tracker.idleSince = Date.now();
      return; // Just started idle, wait
    }

    const idleDuration = Date.now() - tracker.idleSince;
    if (idleDuration < opts.nudgeDelayMs) return;

    if (agent.nudge_count >= opts.nudgeMaxCount) {
      // Max nudges reached — log and skip
      return;
    }

    // Verify idle via capture-pane before nudging
    const paneState = await detectState(agent.pane_id);
    if (paneState !== 'idle') return;

    // Check if there are pending tasks for this agent
    const inbox = await import('./state.js').then((m) => m.readInbox(ctx, name));
    if (!inbox.trim()) return; // No pending work in inbox

    const target: DispatchTarget = {
      name,
      paneId: agent.pane_id,
      cli: agent.cli,
    };
    await nudgeAgent(ctx, target);

    // Update nudge count
    const updated = {
      ...agent,
      nudge_count: agent.nudge_count + 1,
      updated_at: new Date().toISOString(),
    };
    await writeAgentState(ctx, name, updated);

    tracker.idleSince = Date.now(); // Reset timer after nudge
  }

  // ── Outbox processing ──────────────────────────────────────────────
  async function processOutbox(
    ctx: SessionContext,
    reader: OutboxReader,
  ): Promise<void> {
    const entries = await reader.readNew();
    for (const entry of entries) {
      try {
        const task = await import('./state.js').then((m) => m.readTask(ctx, entry.task));
        const updatedTask = {
          ...task,
          status: entry.status === 'completed' ? 'completed' as const : 'failed' as const,
          completed_at: entry.timestamp,
          result: entry.summary,
          error: entry.error ?? null,
        };
        await writeTask(ctx, entry.task, updatedTask);

        const eventType = entry.status === 'completed' ? 'task_completed' : 'task_failed';
        await appendEvent(ctx, eventType as 'task_completed' | 'task_failed', {
          task: entry.task,
          agent: entry.agent,
          summary: entry.summary,
        });
      } catch {
        // Task might not exist yet — skip
      }
    }
  }

  // ── Dependency resolution ──────────────────────────────────────────
  async function resolveDependencies(ctx: SessionContext): Promise<void> {
    const tasks = await listTasks(ctx, 'pending');
    for (const task of tasks) {
      if (task.depends_on.length === 0) continue;
      if (!task.assignee) continue;

      // Check if all dependencies are completed
      let allDepsComplete = true;
      for (const depId of task.depends_on) {
        try {
          const dep = await import('./state.js').then((m) => m.readTask(ctx, depId));
          if (dep.status !== 'completed') {
            allDepsComplete = false;
            break;
          }
        } catch {
          allDepsComplete = false;
          break;
        }
      }

      if (allDepsComplete) {
        // Dependencies met — dispatch the task
        try {
          const agent = await readAgentState(ctx, task.assignee);
          const target: DispatchTarget = {
            name: task.assignee,
            paneId: agent.pane_id,
            cli: agent.cli,
          };

          const inboxContent = [
            `# Task Assignment: ${task.id}`,
            '',
            `## Task`,
            task.subject,
            '',
            `## Description`,
            task.description,
          ].join('\n');

          await dispatchTask(ctx, target, task.id, inboxContent);
        } catch {
          // Agent might not exist — skip
        }
      }
    }
  }

  // ── Orchestrator auto-respawn ──────────────────────────────────────
  async function respawnOrchestrator(
    ctx: SessionContext,
    name: string,
    cli: CliType,
  ): Promise<void> {
    const session = await loadSession(ctx.project, ctx.sessionId);

    // Build recovery instruction
    const vars = buildOrchestratorVars(ctx.project, ctx.sessionId);
    const instructions = await loadAndRenderTemplate('orchestrator', vars);

    // Write recovery inbox with session state
    const agents = await listAgents(ctx);
    const tasks = await listTasks(ctx);
    const recoveryInbox = [
      '# Recovery: Session State',
      '',
      '## Active Agents',
      ...agents.map((a) => `- ${a.name} (${a.cli}, ${a.role}): ${a.state}`),
      '',
      '## Tasks',
      ...tasks.map((t) => `- ${t.id}: ${t.subject} [${t.status}] → ${t.assignee ?? 'unassigned'}`),
      '',
      'Review the state and continue managing the session.',
    ].join('\n');

    // Write instruction file for the new orchestrator
    const instructionPath = join(
      sessionDir(ctx.project, ctx.sessionId),
      'orchestrator-instructions.md',
    );
    await Bun.write(instructionPath, instructions);

    // Build launch command
    const launchOpts = {
      name,
      cli,
      role: 'orchestrator',
      mode: 'interactive' as const,
      cwd: session.cwd,
      instructionPath,
    };

    const { buildLaunchCommand: buildCmd } = await import('../launch/index.js');
    const cmd = buildCmd(launchOpts);

    // Create new pane and launch
    const paneId = await createPane(
      session.tmux_session,
      cmd.join(' '),
      session.cwd,
    );

    // Wait for ready
    await waitForReady(paneId);

    // Start logging
    const logPath = join(
      logsDir(ctx.project, ctx.sessionId),
      `${name}.log`,
    );
    await startPaneLog(paneId, logPath);

    // Update session
    const updatedAgents = session.agents.map((a) => {
      if (a.name === name) {
        return { ...a, pane_id: paneId };
      }
      return a;
    });
    await updateSession(ctx, { agents: updatedAgents });

    // Write recovery inbox
    const { writeInbox: writeInboxFn } = await import('./state.js');
    await writeInboxFn(ctx, name, recoveryInbox);

    // Send recovery trigger
    const { sendMessage } = await import('./tmux.js');
    await sendMessage(paneId, cli, 'Recovery: read your inbox for session state.');

    await appendEvent(ctx, 'agent_respawned', { agent: name, new_pane: paneId });
  }

  // ── fs.watch supplement ────────────────────────────────────────────
  function startFsWatch(): FSWatcher | null {
    try {
      const watchDir = agentsDir(ctx.project, ctx.sessionId);
      return watch(watchDir, { recursive: true }, async (_event, filename) => {
        if (stopped) return;
        if (!filename?.endsWith('.json')) return;
        // Trigger an immediate check on agent state change
        // (supplement to the 5s polling)
      });
    } catch {
      return null;
    }
  }

  // ── Start ──────────────────────────────────────────────────────────
  healthTimer = setTimeout(healthCheck, opts.healthPollMs);
  fsWatcher = startFsWatch();

  return {
    stop() {
      stopped = true;
      if (healthTimer) clearTimeout(healthTimer);
      if (fsWatcher) fsWatcher.close();
    },
  };
}
