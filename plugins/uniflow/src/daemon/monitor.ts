import { type FSWatcher, watch } from "node:fs";
import { agentsDir } from "../lib/constants.js";
import type { AgentStateName, CliType } from "../lib/types.js";
import { type DispatchTarget, dispatchTask, nudgeAgent, shouldNudge } from "./dispatch.js";
import {
  ACTIVITY_THRESHOLD_MS,
  type AgentIdleTracker,
  DISPATCH_GRACE_MS,
  shouldReconcile,
} from "./reconcile.js";
import { respawnOrchestrator } from "./respawn.js";
import {
  appendEvent,
  listAgents,
  listTasks,
  type OutboxReader,
  readAgentState,
  type SessionContext,
  writeAgentState,
  writeTask,
} from "./state.js";
import { detectState, getPaneActivity, isPaneDead, type PaneState } from "./tmux.js";

// Re-export for backward compatibility
export { ACTIVITY_THRESHOLD_MS, type AgentIdleTracker, DISPATCH_GRACE_MS, shouldReconcile };

// ── Monitor ──────────────────────────────────────────────────────────

export interface MonitorOptions {
  healthPollMs: number; // Default: 5000
  nudgeDelayMs: number; // Default: 30000
  nudgeMaxCount: number; // Default: 3
  onSpawn?: (name: string, cli: CliType, role: string) => Promise<void>;
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
/** Exported for dispatch.ts to set lastDispatchedAt */
export const idleTrackers = new Map<string, AgentIdleTracker>();

export function startMonitor(
  ctx: SessionContext,
  outboxReader: OutboxReader,
  opts: MonitorOptions,
): MonitorHandle {
  const lastCrashEvent = new Map<string, number>(); // agent → timestamp of last crash event
  let healthTimer: Timer | null = null;
  let fsWatcher: FSWatcher | null = null;
  let stopped = false;

  // ── Health check loop ──────────────────────────────────────────────
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 3-tier detection adds necessary branches
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

          // 3. Tier-1: pane_activity check — fast metadata query
          const activityEpoch = await getPaneActivity(agent.pane_id);
          const activityAge = activityEpoch > 0 ? Date.now() - activityEpoch * 1000 : Infinity;

          let paneState: PaneState;
          if (activityAge < ACTIVITY_THRESHOLD_MS) {
            // Recently active — infer busy, skip Tier-2
            paneState = "busy";
          } else {
            // 4. Tier-2: capture-pane + classifyOutput
            paneState = await detectState(agent.pane_id);
          }

          // 5. State reconciliation
          if (shouldReconcile(current.state, paneState)) {
            const reconciledState: AgentStateName =
              paneState === "dead" ? "failed" : (paneState as AgentStateName);
            await writeAgentState(ctx, agent.name, {
              ...current,
              state: reconciledState,
              updated_at: new Date().toISOString(),
            });
            await appendEvent(ctx, "agent_status_change", {
              agent: agent.name,
              from: current.state,
              to: paneState,
              source: "daemon",
            });
          }

          // 6. Idle nudge check (uses reconciled state)
          const effectiveState = shouldReconcile(current.state, paneState)
            ? paneState
            : current.state;
          if (effectiveState === "idle") {
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
      console.error("[monitor] health check error:", err);
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
    // Deduplicate: only emit crash event if >60s since last one for this agent
    const now = Date.now();
    const lastCrash = lastCrashEvent.get(name);
    if (!lastCrash || now - lastCrash >= 60_000) {
      await appendEvent(ctx, "agent_crashed", { agent: name });
      lastCrashEvent.set(name, now);
    }

    if (role === "orchestrator") {
      // Auto-respawn orchestrator (D14)
      console.log(`[monitor] Orchestrator ${name} crashed — auto-respawning`);
      try {
        await respawnOrchestrator(ctx, name, cli);
      } catch (err) {
        console.error("[monitor] Failed to respawn orchestrator:", err);
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
      tracker = { idleSince: null, lastDispatchedAt: null };
      idleTrackers.set(name, tracker);
    }

    // Grace period: skip nudge if recently dispatched (D3)
    if (
      tracker.lastDispatchedAt !== null &&
      Date.now() - tracker.lastDispatchedAt < DISPATCH_GRACE_MS
    ) {
      return;
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
    if (!shouldNudge(paneState)) return;

    // Check if there are pending tasks for this agent
    const inbox = await import("./state.js").then((m) => m.readInbox(ctx, name));
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
  async function processOutbox(ctx: SessionContext, reader: OutboxReader): Promise<void> {
    const entries = await reader.readNew();
    for (const entry of entries) {
      try {
        const task = await import("./state.js").then((m) => m.readTask(ctx, entry.task));
        const updatedTask = {
          ...task,
          status: entry.status === "completed" ? ("completed" as const) : ("failed" as const),
          completed_at: entry.timestamp,
          result: entry.summary,
          error: entry.error ?? null,
        };
        await writeTask(ctx, entry.task, updatedTask);

        const eventType = entry.status === "completed" ? "task_completed" : "task_failed";
        await appendEvent(ctx, eventType as "task_completed" | "task_failed", {
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dependency graph traversal
  async function resolveDependencies(ctx: SessionContext): Promise<void> {
    const tasks = await listTasks(ctx, "pending");
    for (const task of tasks) {
      if (task.depends_on.length === 0) continue;
      if (!task.assignee) continue;

      // Check if all dependencies are completed
      let allDepsComplete = true;
      for (const depId of task.depends_on) {
        try {
          const dep = await import("./state.js").then((m) => m.readTask(ctx, depId));
          if (dep.status !== "completed") {
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
            "",
            "## Task",
            task.subject,
            "",
            "## Description",
            task.description,
          ].join("\n");

          await dispatchTask(ctx, target, task.id, inboxContent);
        } catch {
          // Agent might not exist — skip
        }
      }
    }
  }

  // ── fs.watch supplement ────────────────────────────────────────────
  function startFsWatch(): FSWatcher | null {
    try {
      const watchDir = agentsDir(ctx.project, ctx.sessionId);
      return watch(watchDir, { recursive: true }, async (_event, filename) => {
        if (stopped) return;
        if (!filename?.endsWith(".json")) return;

        const agentName = filename.replace(".json", "");
        try {
          const current = await readAgentState(ctx, agentName);
          const paneState = await detectState(current.pane_id);
          if (shouldReconcile(current.state, paneState)) {
            const reconciledState: AgentStateName =
              paneState === "dead" ? "failed" : (paneState as AgentStateName);
            await writeAgentState(ctx, agentName, {
              ...current,
              state: reconciledState,
              updated_at: new Date().toISOString(),
            });
            await appendEvent(ctx, "agent_status_change", {
              agent: agentName,
              from: current.state,
              to: paneState,
              source: "daemon-fswatch",
            });
          }
        } catch {
          // Agent file in mid-write or agent removed — skip
        }
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
