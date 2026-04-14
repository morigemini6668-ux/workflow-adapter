import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildLaunchCommand,
  buildOrchestratorVars,
  buildWorkerVars,
  type LaunchOptions,
  loadAndRenderTemplate,
  prepareLaunch,
} from "../launch/index.js";
import { inboxesDir, logsDir, MAX_WORKERS, sessionDir } from "../lib/constants.js";
import type { AgentState, CliType, SessionAgent, WorkerMode } from "../lib/types.js";
import {
  appendEvent,
  listAgents,
  loadSession,
  type SessionContext,
  updateSession,
  writeAgentState,
} from "./state.js";
import {
  buildReadySignalCommand,
  createPane,
  createWindow,
  getPanePid,
  killPane,
  registerExitHook,
  startPaneLog,
  tmux,
  unregisterExitHook,
  waitForReady,
} from "./tmux.js";

// ── Spawn Options ────────────────────────────────────────────────────

export interface SpawnOptions {
  name: string;
  cli: CliType;
  role: string;
  mode: WorkerMode;
  cwd: string;
  pluginDirs?: string[];
  initialPrompt?: string;
  roleInstructions?: string;
  roleFile?: string;
}

// ── Spawn Agent ──────────────────────────────────────────────────────

/**
 * Spawn a new agent in a tmux pane.
 *
 * Steps:
 * 1. Validate: check worker count limit (max 5 for non-orchestrator)
 * 2. Render instruction template and write to temp file
 * 3. Prepare launch environment (pre-trust, AGENTS.md, etc.)
 * 4. Build CLI command
 * 5. Create tmux pane with the command
 * 6. Start log capture (pipe-pane)
 * 7. Wait for readiness (exponential backoff, auto-dismiss trust)
 * 8. Register agent identity (agents/{name}.json + session.json)
 * 9. Log event
 */
export async function spawnAgent(
  ctx: SessionContext,
  tmuxSession: string,
  opts: SpawnOptions,
): Promise<AgentState> {
  // Step 1: Validate worker count
  if (opts.role !== "orchestrator") {
    const agents = await listAgents(ctx);
    const workerCount = agents.filter((a) => a.role !== "orchestrator").length;
    if (workerCount >= MAX_WORKERS) {
      throw new Error(`Max workers exceeded: ${workerCount}/${MAX_WORKERS}`);
    }
  }

  // Step 2: Resolve role instructions (roleFile takes priority over roleInstructions)
  let effectiveRoleInstructions = opts.roleInstructions;
  if (opts.roleFile) {
    try {
      effectiveRoleInstructions = await readFile(opts.roleFile, "utf-8");
    } catch {
      console.warn(
        `[spawn] Warning: roleFile not found: ${opts.roleFile} — using default role instructions`,
      );
      // Preserve roleFile in metadata for future respawn attempts
    }
  }

  // Render instruction template
  const templateName = opts.role === "orchestrator" ? "orchestrator" : "worker";
  // Use a placeholder pane_id/pid since we don't have them yet — will update after creation
  const vars =
    opts.role === "orchestrator"
      ? buildOrchestratorVars(ctx.project, ctx.sessionId)
      : buildWorkerVars(
          ctx.project,
          ctx.sessionId,
          opts.name,
          opts.cli,
          opts.role,
          "pending", // placeholder pane_id
          0, // placeholder pid
          effectiveRoleInstructions,
        );

  const instructionContent = await loadAndRenderTemplate(templateName, vars);

  // Write instruction to temp file in session directory
  const instructionPath = join(
    sessionDir(ctx.project, ctx.sessionId),
    `instructions-${opts.name}.md`,
  );
  await writeFile(instructionPath, instructionContent, "utf-8");

  // Step 3: Prepare launch environment
  const launchOpts: LaunchOptions = {
    name: opts.name,
    cli: opts.cli,
    role: opts.role,
    mode: opts.mode,
    cwd: opts.cwd,
    instructionPath,
    pluginDirs: opts.pluginDirs,
    initialPrompt: opts.initialPrompt,
  };
  await prepareLaunch(launchOpts);

  // Step 4: Build CLI command with ready-signal wrapper
  const cmdArgs = buildLaunchCommand(launchOpts);
  const fullCommand = cmdArgs.join(" ");

  // Generate unique spawnId for this spawn (prevents cross-spawn channel collisions) (D20)
  const spawnId = crypto.randomUUID().slice(0, 8);
  const readyChannel = `agent-${opts.name}-${spawnId}-ready`;
  const wrappedCommand = buildReadySignalCommand(fullCommand, readyChannel);

  // Step 5: Create tmux pane (workers go to "workers" window)
  let paneId: string;
  if (opts.role !== "orchestrator") {
    // Check if "workers" window exists
    const listResult = await tmux(["list-windows", "-t", tmuxSession, "-F", "#{window_name}"]);
    const hasWorkersWindow =
      listResult.exitCode === 0 && listResult.stdout.split("\n").includes("workers");

    if (!hasWorkersWindow) {
      // First worker: create "workers" window with the command
      paneId = await createWindow(tmuxSession, "workers", wrappedCommand, opts.cwd);
    } else {
      // Subsequent workers: split within "workers" window
      paneId = await createPane(tmuxSession, wrappedCommand, opts.cwd, "workers");
    }

    // Apply tiled layout to workers window
    await tmux(["select-layout", "-t", `${tmuxSession}:workers`, "tiled"]);
  } else {
    // Orchestrator: split from current pane (where TUI/daemon runs)
    const tuiPane = process.env.TMUX_PANE;
    paneId = await createPane(tmuxSession, wrappedCommand, opts.cwd, undefined, tuiPane ?? undefined);
  }

  // Step 5b: Set remain-on-exit so pane-exited hook can inspect exit status (D9)
  await tmux(["set-option", "-t", paneId, "remain-on-exit", "on"]);

  // Step 5c: Register exit hook for crash detection (with spawnId) (D7)
  await registerExitHook(opts.name, paneId, spawnId);

  // Step 6: Start log capture
  const logPath = join(logsDir(ctx.project, ctx.sessionId), `${opts.name}.log`);
  await startPaneLog(paneId, logPath);

  // Step 7: Get PID and wait for readiness
  let pid: number;
  try {
    pid = await getPanePid(paneId);
  } catch {
    pid = 0;
  }

  // Re-render template with actual pane_id and pid for worker
  if (opts.role !== "orchestrator") {
    const finalVars = buildWorkerVars(
      ctx.project,
      ctx.sessionId,
      opts.name,
      opts.cli,
      opts.role,
      paneId,
      pid,
      effectiveRoleInstructions,
    );
    const finalInstruction = await loadAndRenderTemplate("worker", finalVars);
    await writeFile(instructionPath, finalInstruction, "utf-8");

    // Codex reads AGENTS.md from cwd — update it with final instructions
    if (opts.cli === "codex") {
      const agentsMdPath = join(opts.cwd, "AGENTS.md");
      await writeFile(agentsMdPath, finalInstruction, "utf-8");
    }
  }

  try {
    await waitForReady(paneId, undefined, opts.name, spawnId);
  } catch (err) {
    // Clean up on failure
    await killPane(paneId, opts.cli);
    throw err;
  }

  // Step 8: Register agent identity (includes spawnId for hook/channel cleanup)
  const now = new Date().toISOString();
  const agentState: AgentState = {
    name: opts.name,
    cli: opts.cli,
    role: opts.role,
    pane_id: paneId,
    pid,
    spawn_id: spawnId,
    state: "idle",
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: now,
    updated_at: now,
  };

  await writeAgentState(ctx, opts.name, agentState);

  // Add to session.json agents list (persist roleFile for respawn)
  const session = await loadSession(ctx.project, ctx.sessionId);
  const sessionAgent: SessionAgent = {
    name: opts.name,
    cli: opts.cli,
    role: opts.role,
    pane_id: paneId,
    pid,
    ...(opts.roleFile ? { roleFile: opts.roleFile } : {}),
  };
  await updateSession(ctx, {
    agents: [...session.agents, sessionAgent],
  });

  // Step 9: Log event
  await appendEvent(ctx, "agent_spawned", {
    agent: opts.name,
    cli: opts.cli,
    role: opts.role,
    pane_id: paneId,
    spawn_id: spawnId,
    mode: opts.mode,
  });

  return agentState;
}

/**
 * Spawn the orchestrator agent specifically.
 * This is a convenience wrapper with orchestrator defaults.
 */
export async function spawnOrchestrator(
  ctx: SessionContext,
  tmuxSession: string,
  cli: CliType,
  cwd: string,
  pluginDirs?: string[],
): Promise<AgentState> {
  return spawnAgent(ctx, tmuxSession, {
    name: "orchestrator",
    cli,
    role: "orchestrator",
    mode: "interactive",
    cwd,
    pluginDirs,
  });
}

/**
 * Respawn a crashed agent: kill old pane (if any), spawn fresh.
 * Writes a recovery inbox with context about the crash.
 */
export async function respawnAgent(
  ctx: SessionContext,
  tmuxSession: string,
  opts: SpawnOptions,
  recoveryMessage?: string,
): Promise<AgentState> {
  // Try to kill old pane if it exists
  const session = await loadSession(ctx.project, ctx.sessionId);
  const existing = session.agents.find((a) => a.name === opts.name);
  if (existing) {
    // Clean up old hooks before re-registering (D22)
    await unregisterExitHook(existing.pane_id);

    try {
      await killPane(existing.pane_id, opts.cli);
    } catch {
      // Already dead, that's fine
    }

    // Remove from session agents list
    await updateSession(ctx, {
      agents: session.agents.filter((a) => a.name !== opts.name),
    });
  }

  // Spawn fresh agent
  const agent = await spawnAgent(ctx, tmuxSession, opts);

  // Write recovery inbox if provided
  if (recoveryMessage) {
    const inboxPath = join(inboxesDir(ctx.project, ctx.sessionId), `${opts.name}.md`);
    await writeFile(inboxPath, recoveryMessage, "utf-8");
  }

  await appendEvent(ctx, "agent_respawned", {
    agent: opts.name,
    cli: opts.cli,
    had_existing: !!existing,
  });

  return agent;
}
