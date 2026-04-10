import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG, socketPath, UNIFLOW_ID_FILE } from "../lib/constants.js";
import type { CliType } from "../lib/types.js";
import { type MonitorHandle, setShutdownInProgress, startMonitor } from "./monitor.js";
import { type DaemonServer, startServer } from "./server.js";
import { spawnAgent } from "./spawn.js";
import {
  appendEvent,
  archiveSession,
  createSession,
  findActiveSession,
  listAgents,
  loadSession,
  OutboxReader,
  type SessionContext,
} from "./state.js";
import {
  currentSession as currentTmuxSession,
  isPaneDead,
  killPane,
  killWindow,
} from "./tmux.js";

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
  pluginDirs?: string[];
}

/**
 * Start the daemon: create session, spawn orchestrator, start IPC + monitor.
 * Runs in the current tmux pane — TUI is rendered in-process by the caller.
 */
export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonHandle> {
  // 1. Read project identity
  const projectName = await readProjectName(opts.cwd);

  // 2. Check for existing active session
  const existing = await findActiveSession(projectName);
  if (existing) {
    throw new Error(`Session already active: ${existing.id}`);
  }

  // 3. Require tmux
  const tmuxName = await currentTmuxSession();
  if (!tmuxName) {
    throw new Error("uniflow requires running inside a tmux session.");
  }

  // 4. Create session state (always here=true: current tmux session)
  const session = await createSession({
    project: projectName,
    cwd: opts.cwd,
    tmuxSession: tmuxName,
    daemonPid: process.pid,
    here: true,
    pluginDirs: opts.pluginDirs,
  });

  const ctx: SessionContext = {
    project: projectName,
    sessionId: session.id,
  };

  await appendEvent(ctx, "session_started", { cwd: opts.cwd });

  // 5. Start IPC server (with spawn handler)
  const outboxReader = new OutboxReader(ctx);
  const onSpawn = async (args: Record<string, unknown>) => {
    const name = args.name as string;
    const cli = (args.cli as CliType) ?? "claude";
    const role = (args.role as string) ?? "worker";
    const mode = (args.mode as string) ?? "interactive";
    const roleFile = args.roleFile as string | undefined;
    if (!name) throw new Error("Agent name required");
    const agent = await spawnAgent(ctx, tmuxName, {
      name,
      cli,
      role,
      mode: mode as "interactive" | "non_interactive",
      cwd: opts.cwd,
      pluginDirs: opts.pluginDirs,
      roleFile,
    });
    return { spawned: name, pane_id: agent.pane_id };
  };
  const server = await startServer(ctx, outboxReader, onSpawn);

  // 6. Start monitoring loop
  const monitor = startMonitor(ctx, outboxReader, {
    healthPollMs: DEFAULT_CONFIG.health_poll_interval_ms,
    nudgeDelayMs: DEFAULT_CONFIG.nudge_delay_ms,
    nudgeMaxCount: DEFAULT_CONFIG.nudge_max_count,
  });

  // 7. Launch orchestrator (splits from current pane via $TMUX_PANE)
  await spawnAgent(ctx, tmuxName, {
    name: "orchestrator",
    cli: opts.orchestratorCli,
    role: "orchestrator",
    mode: "interactive",
    cwd: opts.cwd,
    pluginDirs: opts.pluginDirs,
    initialPrompt: "You are the uniflow orchestrator. The user will give you instructions.",
  });

  console.log(`[daemon] Session ${session.id} started for project ${projectName}`);
  console.log(`[daemon] Socket: ${socketPath(projectName)}`);

  return {
    ctx,
    server,
    monitor,
    async stop() {
      // 1. Activate shutdown latch
      setShutdownInProgress(true);

      // 2. Stop monitor to prevent new nudges
      monitor.stop();

      // 3. Kill all agent panes
      const agents = await listAgents(ctx);
      for (const agent of agents) {
        try {
          if (!(await isPaneDead(agent.pane_id))) {
            await killPane(agent.pane_id, agent.cli);
          }
        } catch {
          /* pane already gone */
        }
      }

      // 4. Kill workers window if it exists
      const sess = await loadSession(ctx.project, ctx.sessionId).catch(() => null);
      if (sess) {
        try {
          await killWindow(sess.tmux_session, "workers");
        } catch {
          /* window may not exist */
        }
      }

      // 5. Archive session
      await appendEvent(ctx, "session_stopped", {});
      await archiveSession(ctx);

      // 6. Close IPC server
      server.close();
    },
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────

async function readProjectName(cwd: string): Promise<string> {
  const idPath = join(cwd, UNIFLOW_ID_FILE);
  try {
    const content = await readFile(idPath, "utf-8");
    return content.trim();
  } catch {
    throw new Error(`No ${UNIFLOW_ID_FILE} found in ${cwd}. Run "uniflow init" first.`);
  }
}
