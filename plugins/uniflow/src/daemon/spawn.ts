import { writeFile } from "node:fs/promises";
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
import { createPane, getPanePid, killPane, startPaneLog, waitForReady } from "./tmux.js";

// ── Spawn Options ────────────────────────────────────────────────────

export interface SpawnOptions {
  name: string;
  cli: CliType;
  role: string;
  mode: WorkerMode;
  cwd: string;
  pluginDir?: string;
  initialPrompt?: string;
  roleInstructions?: string;
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

  // Step 2: Render instruction template
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
          opts.roleInstructions,
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
    pluginDir: opts.pluginDir,
    initialPrompt: opts.initialPrompt,
  };
  await prepareLaunch(launchOpts);

  // Step 4: Build CLI command
  const cmdArgs = buildLaunchCommand(launchOpts);
  const fullCommand = cmdArgs.join(" ");

  // Step 5: Create tmux pane
  const paneId = await createPane(tmuxSession, fullCommand, opts.cwd);

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
      opts.roleInstructions,
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
    await waitForReady(paneId);
  } catch (err) {
    // Clean up on failure
    await killPane(paneId, opts.cli);
    throw err;
  }

  // Step 8: Register agent identity
  const now = new Date().toISOString();
  const agentState: AgentState = {
    name: opts.name,
    cli: opts.cli,
    role: opts.role,
    pane_id: paneId,
    pid,
    state: "idle",
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: now,
    updated_at: now,
  };

  await writeAgentState(ctx, opts.name, agentState);

  // Add to session.json agents list
  const session = await loadSession(ctx.project, ctx.sessionId);
  const sessionAgent: SessionAgent = {
    name: opts.name,
    cli: opts.cli,
    role: opts.role,
    pane_id: paneId,
    pid,
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
  pluginDir?: string,
): Promise<AgentState> {
  return spawnAgent(ctx, tmuxSession, {
    name: "orchestrator",
    cli,
    role: "orchestrator",
    mode: "interactive",
    cwd,
    pluginDir,
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
