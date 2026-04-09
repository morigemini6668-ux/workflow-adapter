import { join } from "node:path";
import { logsDir } from "../lib/constants.js";
import type { AgentState, Task } from "../lib/types.js";
import { type DispatchTarget, dispatchMessage, dispatchTask, nudgeAgent } from "./dispatch.js";
import { respawnAgent } from "./spawn.js";
import {
  appendEvent,
  archiveSession,
  listAgents,
  listTasks,
  loadSession,
  type OutboxReader,
  readAgentState,
  readTask,
  removeAgentState,
  type SessionContext,
  updateSession,
  writeAgentState,
  writeTask,
} from "./state.js";
import { capturePane, getPaneActivity, isPaneDead, killPane, killSession } from "./tmux.js";

// ── Helpers ──────────────────────────────────────────────────────────

async function requireAgent(ctx: SessionContext, name: string): Promise<AgentState> {
  try {
    return await readAgentState(ctx, name);
  } catch {
    throw new Error(`Agent not found: ${name}`);
  }
}

// ── Command Handlers ─────────────────────────────────────────────────

export async function handleStatus(
  ctx: SessionContext,
  outboxReader: OutboxReader,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const session = await loadSession(ctx.project, ctx.sessionId);
  const agents = await listAgents(ctx);
  const tasks = await listTasks(ctx);
  const newOutbox = await outboxReader.readNew();
  const peek = args.peek === true;

  return {
    session: {
      id: session.id,
      project: session.project,
      status: session.status,
      created_at: session.created_at,
      cwd: session.cwd,
    },
    agents: await Promise.all(
      agents.map(async (a) => {
        const activity = await getPaneActivity(a.pane_id);
        return {
          name: a.name,
          cli: a.cli,
          role: a.role,
          state: a.state,
          current_task: a.current_task,
          progress: a.progress,
          pane_id: a.pane_id,
          last_activity_seconds:
            activity > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - activity) : null,
          ...(peek ? { pane_tail: await capturePane(a.pane_id, 5) } : {}),
        };
      }),
    ),
    tasks: tasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      assignee: t.assignee,
      priority: t.priority,
      depends_on: t.depends_on,
    })),
    recent_results: newOutbox,
  };
}

export async function handleTasks(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<Task[]> {
  const status = args.status as Task["status"] | undefined;
  return listTasks(ctx, status);
}

export async function handleTaskCreate(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ id: string }> {
  const id = args.id as string;
  const subject = args.subject as string;
  const description = (args.description as string) ?? subject;
  const priority = (args.priority as number) ?? 3;
  const dependsOn = (args.depends_on as string[]) ?? [];
  const assignee = (args.assignee as string | null) ?? null;

  if (!id || !subject) throw new Error("Task ID and subject required");

  const task: Task = {
    id,
    subject,
    description,
    status: "pending",
    assignee,
    priority,
    depends_on: dependsOn,
    created_at: new Date().toISOString(),
    assigned_at: null,
    completed_at: null,
    result: null,
    error: null,
  };

  await writeTask(ctx, id, task);
  await appendEvent(ctx, "task_created", { task: id, subject });

  return { id };
}

export async function handleKill(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ killed: string }> {
  const name = args.name as string;
  if (!name) throw new Error("Agent name required");

  const agent = await requireAgent(ctx, name);
  await killPane(agent.pane_id, agent.cli);
  await removeAgentState(ctx, name);

  const session = await loadSession(ctx.project, ctx.sessionId);
  const updatedAgents = session.agents.filter((a) => a.name !== name);
  await updateSession(ctx, { agents: updatedAgents });

  await appendEvent(ctx, "agent_killed", { agent: name });

  return { killed: name };
}

export async function handleAssign(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ assigned: boolean }> {
  const agentName = args.agent as string;
  const taskId = args.taskId as string;
  if (!agentName || !taskId) throw new Error("Agent name and task ID required");

  const agent = await requireAgent(ctx, agentName);
  const task = await readTask(ctx, taskId);

  for (const depId of task.depends_on) {
    const dep = await readTask(ctx, depId);
    if (dep.status !== "completed") {
      throw new Error(`Task ${taskId} depends on incomplete task ${depId}`);
    }
  }

  const updatedTask: Task = {
    ...task,
    status: "in_progress",
    assignee: agentName,
    assigned_at: new Date().toISOString(),
  };
  await writeTask(ctx, taskId, updatedTask);

  const inboxContent = [
    `# Task Assignment: ${taskId}`,
    "",
    "## Task",
    task.subject,
    "",
    "## Description",
    task.description,
    "",
    "## Priority",
    `${task.priority}`,
  ].join("\n");

  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  await dispatchTask(ctx, target, taskId, inboxContent);

  return { assigned: true };
}

export async function handleSend(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ sent: boolean }> {
  const agentName = args.agent as string;
  const message = args.message as string;
  const mode = (args.mode as "interrupt" | "nudge") ?? "nudge";
  if (!agentName || !message) throw new Error("Agent name and message required");

  const agent = await requireAgent(ctx, agentName);
  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  await dispatchMessage(ctx, target, message, mode);

  return { sent: true };
}

export async function handleNudge(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ nudged: boolean }> {
  const agentName = args.name as string;
  if (!agentName) throw new Error("Agent name required");

  const agent = await requireAgent(ctx, agentName);
  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  const didNudge = await nudgeAgent(ctx, target);

  if (didNudge) {
    const updated: AgentState = {
      ...agent,
      nudge_count: agent.nudge_count + 1,
      updated_at: new Date().toISOString(),
    };
    await writeAgentState(ctx, agentName, updated);
  }

  return { nudged: didNudge };
}

export async function handleRespawn(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ respawned: string; pane_id: string }> {
  const name = args.name as string;
  if (!name) throw new Error("Agent name required");

  const agent = await requireAgent(ctx, name);
  const session = await loadSession(ctx.project, ctx.sessionId);

  const recoveryMessage = [
    "# Recovery Notice",
    "",
    `You are ${name}, respawned after a crash.`,
    `Session: ${ctx.sessionId}`,
    `Role: ${agent.role}`,
    "",
    "Check your inbox for any pending tasks. Run status update immediately.",
  ].join("\n");

  const newAgent = await respawnAgent(
    ctx,
    session.tmux_session,
    { name, cli: agent.cli, role: agent.role, mode: "interactive", cwd: session.cwd },
    recoveryMessage,
  );

  return { respawned: name, pane_id: newAgent.pane_id };
}

export async function handleLogs(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ logs: string }> {
  const agentName = args.name as string;
  const lines = (args.lines as number) ?? 50;
  if (!agentName) throw new Error("Agent name required");

  await requireAgent(ctx, agentName);

  const logPath = join(logsDir(ctx.project, ctx.sessionId), `${agentName}.log`);
  try {
    const content = await Bun.file(logPath).text();
    const allLines = content.split("\n");
    return { logs: allLines.slice(-lines).join("\n") };
  } catch {
    return { logs: "" };
  }
}

export async function handlePeek(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ output: string }> {
  const agentName = args.name as string;
  if (!agentName) throw new Error("Agent name required");

  const agent = await requireAgent(ctx, agentName);
  const output = await capturePane(agent.pane_id, 60);
  return { output };
}

export async function handleStop(ctx: SessionContext): Promise<{ stopped: boolean }> {
  const session = await loadSession(ctx.project, ctx.sessionId);

  const agents = await listAgents(ctx);
  for (const agent of agents) {
    try {
      if (!(await isPaneDead(agent.pane_id))) {
        await killPane(agent.pane_id, agent.cli);
      }
    } catch {
      // pane_id might be invalid — continue
    }
  }

  try {
    await killSession(session.tmux_session);
  } catch {
    // Session may already be gone
  }

  await appendEvent(ctx, "session_stopped", {});
  await archiveSession(ctx);

  return { stopped: true };
}

export async function handleWorktreeCreate(
  args: Record<string, unknown>,
): Promise<{ worktree: string }> {
  const agentName = args.agent as string;
  const branch = args.branch as string | undefined;
  if (!agentName) throw new Error("Agent name required");

  const branchName = branch ?? `uniflow/${agentName}`;
  const proc = Bun.spawn(
    ["git", "worktree", "add", "-b", branchName, `../.uniflow-worktrees/${agentName}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;

  return { worktree: `../.uniflow-worktrees/${agentName}` };
}

export async function handleWorktreeMerge(
  args: Record<string, unknown>,
): Promise<{ merged: boolean }> {
  const agentName = args.agent as string;
  if (!agentName) throw new Error("Agent name required");

  const worktreePath = `../.uniflow-worktrees/${agentName}`;

  const merge = Bun.spawn(["git", "merge", "--no-ff", `uniflow/${agentName}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await merge.exited;

  const remove = Bun.spawn(["git", "worktree", "remove", worktreePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await remove.exited;

  const branchDelete = Bun.spawn(["git", "branch", "-d", `uniflow/${agentName}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await branchDelete.exited;

  return { merged: true };
}
