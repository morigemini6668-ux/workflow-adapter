import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  socketPath,
  sessionDir,
  logsDir,
  tmuxSessionName,
  UNIFLOW_ID_FILE,
  DEFAULT_CONFIG,
} from '../lib/constants.js';
import type { CliType } from '../lib/types.js';
import {
  createSession,
  findActiveSession,
  loadSession,
  OutboxReader,
  appendEvent,
  type SessionContext,
} from './state.js';
import { createSession as createTmuxSession, hasSession as hasTmuxSession, applyLayout } from './tmux.js';
import { startServer, type DaemonServer } from './server.js';
import { startMonitor, type MonitorHandle } from './monitor.js';
import { spawnAgent } from './spawn.js';
import {
  loadAndRenderTemplate,
  buildOrchestratorVars,
  buildLaunchCommand,
  prepareLaunch,
} from '../launch/index.js';
import { createPane, waitForReady, startPaneLog } from './tmux.js';

// ── Daemon Lifecycle ─────────────────────────────────────────────────

export interface DaemonHandle {
  ctx: SessionContext;
  server: DaemonServer;
  monitor: MonitorHandle;
  stop(): Promise<void>;
}

export interface StartDaemonOptions {
  cwd: string;
  orchestratorCli: CliType;
  tui?: boolean;
  pluginDir?: string;
}

/**
 * Start the daemon: create session, launch tmux, spawn orchestrator, start IPC + monitor.
 * This is the main entry point called by `uniflow start`.
 */
export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonHandle> {
  // 1. Read project identity
  const projectName = await readProjectName(opts.cwd);

  // 2. Check for existing active session
  const existing = await findActiveSession(projectName);
  if (existing) {
    throw new Error(`Session already active: ${existing.id}`);
  }

  // 3. Create tmux session
  const tmuxName = tmuxSessionName(projectName);
  if (!(await hasTmuxSession(tmuxName))) {
    await createTmuxSession(tmuxName, opts.cwd);
  }

  // 4. Create session state
  const session = await createSession({
    project: projectName,
    cwd: opts.cwd,
    tmuxSession: tmuxName,
    daemonPid: process.pid,
  });

  const ctx: SessionContext = {
    project: projectName,
    sessionId: session.id,
  };

  await appendEvent(ctx, 'session_started', { cwd: opts.cwd });

  // 5. Start IPC server (with spawn handler)
  const outboxReader = new OutboxReader(ctx);
  const onSpawn = async (args: Record<string, unknown>) => {
    const name = args.name as string;
    const cli = (args.cli as CliType) ?? 'claude';
    const role = (args.role as string) ?? 'worker';
    const mode = (args.mode as string) ?? 'interactive';
    if (!name) throw new Error('Agent name required');
    const agent = await spawnAgent(ctx, session.tmux_session, {
      name,
      cli,
      role,
      mode: mode as 'interactive' | 'non_interactive',
      cwd: opts.cwd,
    });
    await applyLayout(tmuxName);
    return { spawned: name, pane_id: agent.pane_id };
  };
  const server = await startServer(ctx, outboxReader, onSpawn);

  // 6. Start monitoring loop
  const monitor = startMonitor(ctx, outboxReader, {
    healthPollMs: DEFAULT_CONFIG.health_poll_interval_ms,
    nudgeDelayMs: DEFAULT_CONFIG.nudge_delay_ms,
    nudgeMaxCount: DEFAULT_CONFIG.nudge_max_count,
  });

  // 7. Launch orchestrator
  await launchOrchestrator(ctx, session.tmux_session, opts);

  // 8. Apply tmux layout
  await applyLayout(tmuxName);

  console.log(`[daemon] Session ${session.id} started for project ${projectName}`);
  console.log(`[daemon] Socket: ${socketPath(projectName)}`);

  return {
    ctx,
    server,
    monitor,
    async stop() {
      monitor.stop();
      server.close();
    },
  };
}

/**
 * Reconnect to an existing daemon session.
 * Used when `uniflow start` detects an existing tmux session after a daemon crash.
 */
export async function reconnectDaemon(
  cwd: string,
): Promise<DaemonHandle> {
  const projectName = await readProjectName(cwd);
  const existing = await findActiveSession(projectName);

  if (!existing) {
    throw new Error('No active session to reconnect to');
  }

  const ctx: SessionContext = {
    project: projectName,
    sessionId: existing.id,
  };

  const outboxReader = new OutboxReader(ctx);
  const onSpawn = async (args: Record<string, unknown>) => {
    const name = args.name as string;
    const cli = (args.cli as CliType) ?? 'claude';
    const role = (args.role as string) ?? 'worker';
    const mode = (args.mode as string) ?? 'interactive';
    if (!name) throw new Error('Agent name required');
    const agent = await spawnAgent(ctx, existing.tmux_session, {
      name,
      cli,
      role,
      mode: mode as 'interactive' | 'non_interactive',
      cwd,
    });
    await applyLayout(existing.tmux_session);
    return { spawned: name, pane_id: agent.pane_id };
  };
  const server = await startServer(ctx, outboxReader, onSpawn);
  const monitor = startMonitor(ctx, outboxReader, {
    healthPollMs: DEFAULT_CONFIG.health_poll_interval_ms,
    nudgeDelayMs: DEFAULT_CONFIG.nudge_delay_ms,
    nudgeMaxCount: DEFAULT_CONFIG.nudge_max_count,
  });

  console.log(`[daemon] Reconnected to session ${existing.id}`);

  return {
    ctx,
    server,
    monitor,
    async stop() {
      monitor.stop();
      server.close();
    },
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────

async function readProjectName(cwd: string): Promise<string> {
  const idPath = join(cwd, UNIFLOW_ID_FILE);
  try {
    const content = await readFile(idPath, 'utf-8');
    return content.trim();
  } catch {
    throw new Error(`No ${UNIFLOW_ID_FILE} found in ${cwd}. Run "uniflow init" first.`);
  }
}

async function launchOrchestrator(
  ctx: SessionContext,
  tmuxSession: string,
  opts: StartDaemonOptions,
): Promise<void> {
  // 1. Render orchestrator instructions
  const vars = buildOrchestratorVars(ctx.project, ctx.sessionId);
  const instructions = await loadAndRenderTemplate('orchestrator', vars);

  // 2. Write instruction file
  const instructionPath = join(
    sessionDir(ctx.project, ctx.sessionId),
    'orchestrator-instructions.md',
  );
  await writeFile(instructionPath, instructions);

  // 3. Prepare launch environment (pre-trust, etc.)
  const launchOpts = {
    name: 'orchestrator',
    cli: opts.orchestratorCli,
    role: 'orchestrator',
    mode: 'interactive' as const,
    cwd: opts.cwd,
    instructionPath,
    pluginDir: opts.pluginDir,
    initialPrompt: 'You are the uniflow orchestrator. The user will give you instructions.',
  };
  await prepareLaunch(launchOpts);

  // 4. Build launch command
  const cmd = buildLaunchCommand(launchOpts);

  // 5. Create pane and launch
  const paneId = await createPane(tmuxSession, cmd.join(' '), opts.cwd);

  // 6. Wait for agent to be ready
  await waitForReady(paneId);

  // 7. Start logging
  const logPath = join(logsDir(ctx.project, ctx.sessionId), 'orchestrator.log');
  await startPaneLog(paneId, logPath);

  // 8. Register in session
  const { updateSession } = await import('./state.js');
  const session = await loadSession(ctx.project, ctx.sessionId);
  await updateSession(ctx, {
    agents: [
      ...session.agents,
      {
        name: 'orchestrator',
        cli: opts.orchestratorCli,
        role: 'orchestrator',
        pane_id: paneId,
        pid: 0, // Will be updated after getPanePid
      },
    ],
  });

  await appendEvent(ctx, 'agent_spawned', {
    agent: 'orchestrator',
    cli: opts.orchestratorCli,
    pane_id: paneId,
  });
}
