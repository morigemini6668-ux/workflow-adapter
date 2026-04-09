import { join } from "node:path";
import { buildOrchestratorVars, loadAndRenderTemplate } from "../launch/index.js";
import { logsDir, sessionDir } from "../lib/constants.js";
import type { CliType } from "../lib/types.js";
import {
  appendEvent,
  listAgents,
  listTasks,
  loadSession,
  type SessionContext,
  updateSession,
} from "./state.js";
import { createPane, startPaneLog, waitForReady } from "./tmux.js";

/**
 * Respawn a crashed orchestrator agent with full session recovery.
 */
export async function respawnOrchestrator(
  ctx: SessionContext,
  name: string,
  cli: CliType,
): Promise<void> {
  const session = await loadSession(ctx.project, ctx.sessionId);

  // Build recovery instruction
  const vars = buildOrchestratorVars(ctx.project, ctx.sessionId);
  const instructions = await loadAndRenderTemplate("orchestrator", vars);

  // Write recovery inbox with session state
  const agents = await listAgents(ctx);
  const tasks = await listTasks(ctx);
  const recoveryInbox = [
    "# Recovery: Session State",
    "",
    "## Active Agents",
    ...agents.map((a) => `- ${a.name} (${a.cli}, ${a.role}): ${a.state}`),
    "",
    "## Tasks",
    ...tasks.map((t) => `- ${t.id}: ${t.subject} [${t.status}] → ${t.assignee ?? "unassigned"}`),
    "",
    "Review the state and continue managing the session.",
  ].join("\n");

  // Write instruction file for the new orchestrator
  const instructionPath = join(
    sessionDir(ctx.project, ctx.sessionId),
    "orchestrator-instructions.md",
  );
  await Bun.write(instructionPath, instructions);

  // Build launch command
  const launchOpts = {
    name,
    cli,
    role: "orchestrator",
    mode: "interactive" as const,
    cwd: session.cwd,
    instructionPath,
  };

  const { buildLaunchCommand: buildCmd } = await import("../launch/index.js");
  const cmd = buildCmd(launchOpts);

  // Create new pane and launch
  const paneId = await createPane(session.tmux_session, cmd.join(" "), session.cwd);
  await waitForReady(paneId);

  // Start logging
  const logPath = join(logsDir(ctx.project, ctx.sessionId), `${name}.log`);
  await startPaneLog(paneId, logPath);

  // Update session
  const updatedAgents = session.agents.map((a) => {
    if (a.name === name) return { ...a, pane_id: paneId };
    return a;
  });
  await updateSession(ctx, { agents: updatedAgents });

  // Write recovery inbox + trigger
  const { writeInbox: writeInboxFn } = await import("./state.js");
  await writeInboxFn(ctx, name, recoveryInbox);
  const { sendMessage } = await import("./tmux.js");
  await sendMessage(paneId, cli, "Recovery: read your inbox for session state.");

  await appendEvent(ctx, "agent_respawned", { agent: name, new_pane: paneId });
}
