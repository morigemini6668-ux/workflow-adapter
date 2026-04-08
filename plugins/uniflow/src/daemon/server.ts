import { unlinkSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { socketPath, logsDir, UNIFLOW_SOCKETS_DIR } from '../lib/constants.js';
import {
  DaemonRequestSchema,
  type DaemonRequest,
  type DaemonResponse,
  type Task,
  type AgentState,
} from '../lib/types.js';
import {
  type SessionContext,
  loadSession,
  updateSession,
  archiveSession,
  listAgents,
  readAgentState,
  writeAgentState,
  removeAgentState,
  listTasks,
  readTask,
  writeTask,
  OutboxReader,
  appendEvent,
} from './state.js';
import { dispatchTask, dispatchMessage, nudgeAgent, type DispatchTarget } from './dispatch.js';
import { capturePane, killPane, killSession, isPaneDead } from './tmux.js';
import { respawnAgent } from './spawn.js';

// ── IPC Server ───────────────────────────────────────────────────────

export interface DaemonServer {
  close(): void;
}

/**
 * Start the Unix domain socket IPC server.
 * Listens for DaemonRequest messages and routes them to handlers.
 */
export async function startServer(
  ctx: SessionContext,
  outboxReader: OutboxReader,
  onSpawn?: (args: Record<string, unknown>) => Promise<unknown>,
): Promise<DaemonServer> {
  const sockPath = socketPath(ctx.project);
  await mkdir(UNIFLOW_SOCKETS_DIR, { recursive: true });

  // Clean up stale socket
  try { unlinkSync(sockPath); } catch {}

  const server = Bun.listen({
    unix: sockPath,
    socket: {
      async data(socket, rawData) {
        const text = typeof rawData === 'string'
          ? rawData
          : Buffer.from(rawData).toString('utf-8');

        // Handle multiple newline-delimited messages in one chunk
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;

          let response: DaemonResponse;
          try {
            const request = DaemonRequestSchema.parse(JSON.parse(line));
            response = await handleRequest(ctx, request, outboxReader, onSpawn);
          } catch (err) {
            response = {
              requestId: 'unknown',
              success: false,
              error: err instanceof Error ? err.message : 'Parse error',
            };
          }

          socket.write(JSON.stringify(response) + '\n');
        }
      },
      open() {},
      close() {},
      error(_socket, err) {
        console.error('[daemon] socket error:', err.message);
      },
    },
  });

  return {
    close() {
      server.stop();
      try { unlinkSync(sockPath); } catch {}
    },
  };
}

// ── Command Router ───────────────────────────────────────────────────

async function handleRequest(
  ctx: SessionContext,
  req: DaemonRequest,
  outboxReader: OutboxReader,
  onSpawn?: (args: Record<string, unknown>) => Promise<unknown>,
): Promise<DaemonResponse> {
  const ok = (data?: unknown): DaemonResponse => ({
    requestId: req.requestId,
    success: true,
    data,
  });

  const fail = (error: string): DaemonResponse => ({
    requestId: req.requestId,
    success: false,
    error,
  });

  try {
    switch (req.command) {
      case 'status':
        return ok(await handleStatus(ctx, outboxReader));

      case 'agents':
        return ok(await listAgents(ctx));

      case 'tasks':
        return ok(await handleTasks(ctx, req.args));

      case 'spawn':
        if (!onSpawn) return fail('Spawn handler not registered');
        return ok(await onSpawn(req.args));

      case 'kill':
        return ok(await handleKill(ctx, req.args));

      case 'task-create':
        return ok(await handleTaskCreate(ctx, req.args));

      case 'assign':
        return ok(await handleAssign(ctx, req.args));

      case 'send':
        return ok(await handleSend(ctx, req.args));

      case 'nudge':
        return ok(await handleNudge(ctx, req.args));

      case 'respawn':
        return ok(await handleRespawn(ctx, req.args));

      case 'logs':
        return ok(await handleLogs(ctx, req.args));

      case 'peek':
        return ok(await handlePeek(ctx, req.args));

      case 'stop':
        return ok(await handleStop(ctx));

      case 'worktree-create':
        return ok(await handleWorktreeCreate(req.args));

      case 'worktree-merge':
        return ok(await handleWorktreeMerge(req.args));

      default:
        return fail(`Unknown command: ${req.command}`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Internal error');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function requireAgent(ctx: SessionContext, name: string): Promise<AgentState> {
  try {
    return await readAgentState(ctx, name);
  } catch {
    throw new Error(`Agent not found: ${name}`);
  }
}

// ── Command Handlers ─────────────────────────────────────────────────

async function handleStatus(
  ctx: SessionContext,
  outboxReader: OutboxReader,
): Promise<unknown> {
  const session = await loadSession(ctx.project, ctx.sessionId);
  const agents = await listAgents(ctx);
  const tasks = await listTasks(ctx);
  const newOutbox = await outboxReader.readNew();

  return {
    session: {
      id: session.id,
      project: session.project,
      status: session.status,
      created_at: session.created_at,
      cwd: session.cwd,
    },
    agents: agents.map((a) => ({
      name: a.name,
      cli: a.cli,
      role: a.role,
      state: a.state,
      current_task: a.current_task,
      progress: a.progress,
      pane_id: a.pane_id,
    })),
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

async function handleTasks(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<Task[]> {
  const status = args.status as Task['status'] | undefined;
  return listTasks(ctx, status);
}

async function handleTaskCreate(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ id: string }> {
  const id = args.id as string;
  const subject = args.subject as string;
  const description = (args.description as string) ?? subject;
  const priority = (args.priority as number) ?? 3;
  const dependsOn = (args.depends_on as string[]) ?? [];
  const assignee = (args.assignee as string | null) ?? null;

  if (!id || !subject) throw new Error('Task ID and subject required');

  const task: Task = {
    id,
    subject,
    description,
    status: 'pending',
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
  await appendEvent(ctx, 'task_created', { task: id, subject });

  return { id };
}

async function handleKill(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ killed: string }> {
  const name = args.name as string;
  if (!name) throw new Error('Agent name required');

  const agent = await requireAgent(ctx, name);
  await killPane(agent.pane_id, agent.cli);
  await removeAgentState(ctx, name);

  // Remove from session.json
  const session = await loadSession(ctx.project, ctx.sessionId);
  const updatedAgents = session.agents.filter((a) => a.name !== name);
  await updateSession(ctx, { agents: updatedAgents });

  await appendEvent(ctx, 'agent_killed', { agent: name });

  return { killed: name };
}

async function handleAssign(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ assigned: boolean }> {
  const agentName = args.agent as string;
  const taskId = args.taskId as string;
  if (!agentName || !taskId) throw new Error('Agent name and task ID required');

  const agent = await requireAgent(ctx, agentName);
  const task = await readTask(ctx, taskId);

  // Check dependencies
  for (const depId of task.depends_on) {
    const dep = await readTask(ctx, depId);
    if (dep.status !== 'completed') {
      throw new Error(`Task ${taskId} depends on incomplete task ${depId}`);
    }
  }

  // Update task
  const updatedTask: Task = {
    ...task,
    status: 'in_progress',
    assignee: agentName,
    assigned_at: new Date().toISOString(),
  };
  await writeTask(ctx, taskId, updatedTask);

  // Build inbox content
  const inboxContent = [
    `# Task Assignment: ${taskId}`,
    '',
    `## Task`,
    task.subject,
    '',
    `## Description`,
    task.description,
    '',
    `## Priority`,
    `${task.priority}`,
  ].join('\n');

  // Dispatch to agent
  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  await dispatchTask(ctx, target, taskId, inboxContent);

  return { assigned: true };
}

async function handleSend(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ sent: boolean }> {
  const agentName = args.agent as string;
  const message = args.message as string;
  const mode = (args.mode as 'interrupt' | 'nudge') ?? 'nudge';
  if (!agentName || !message) throw new Error('Agent name and message required');

  const agent = await requireAgent(ctx, agentName);
  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  await dispatchMessage(ctx, target, message, mode);

  return { sent: true };
}

async function handleNudge(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ nudged: boolean }> {
  const agentName = args.name as string;
  if (!agentName) throw new Error('Agent name required');

  const agent = await requireAgent(ctx, agentName);
  const target: DispatchTarget = {
    name: agentName,
    paneId: agent.pane_id,
    cli: agent.cli,
  };
  await nudgeAgent(ctx, target);

  // Increment nudge count
  const updated: AgentState = {
    ...agent,
    nudge_count: agent.nudge_count + 1,
    updated_at: new Date().toISOString(),
  };
  await writeAgentState(ctx, agentName, updated);

  return { nudged: true };
}

async function handleRespawn(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ respawned: string; pane_id: string }> {
  const name = args.name as string;
  if (!name) throw new Error('Agent name required');

  // Read current agent info and session for respawn config
  const agent = await requireAgent(ctx, name);
  const session = await loadSession(ctx.project, ctx.sessionId);

  // Build recovery message with session context
  const recoveryMessage = [
    '# Recovery Notice',
    '',
    `You are ${name}, respawned after a crash.`,
    `Session: ${ctx.sessionId}`,
    `Role: ${agent.role}`,
    '',
    'Check your inbox for any pending tasks. Run status update immediately.',
  ].join('\n');

  // Respawn: kills old pane + spawns fresh agent + writes recovery inbox
  const newAgent = await respawnAgent(
    ctx,
    session.tmux_session,
    {
      name,
      cli: agent.cli,
      role: agent.role,
      mode: 'interactive',
      cwd: session.cwd,
    },
    recoveryMessage,
  );

  return { respawned: name, pane_id: newAgent.pane_id };
}

async function handleLogs(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ logs: string }> {
  const agentName = args.name as string;
  const lines = (args.lines as number) ?? 50;
  if (!agentName) throw new Error('Agent name required');

  await requireAgent(ctx, agentName);

  const logPath = join(logsDir(ctx.project, ctx.sessionId), `${agentName}.log`);
  try {
    const content = await Bun.file(logPath).text();
    const allLines = content.split('\n');
    return { logs: allLines.slice(-lines).join('\n') };
  } catch {
    return { logs: '' };
  }
}

async function handlePeek(
  ctx: SessionContext,
  args: Record<string, unknown>,
): Promise<{ output: string }> {
  const agentName = args.name as string;
  if (!agentName) throw new Error('Agent name required');

  const agent = await requireAgent(ctx, agentName);
  const output = await capturePane(agent.pane_id, 60);
  return { output };
}

async function handleStop(ctx: SessionContext): Promise<{ stopped: boolean }> {
  const session = await loadSession(ctx.project, ctx.sessionId);

  // Kill all agent panes individually
  const agents = await listAgents(ctx);
  for (const agent of agents) {
    try {
      if (!(await isPaneDead(agent.pane_id))) {
        await killPane(agent.pane_id, agent.cli);
      }
    } catch {
      // pane_id might be invalid (e.g., "pending") — continue
    }
  }

  // Fallback: kill the entire tmux session to catch orphan panes
  try {
    await killSession(session.tmux_session);
  } catch {
    // Session may already be gone
  }

  // Log event BEFORE archive (archive moves the directory)
  await appendEvent(ctx, 'session_stopped', {});
  await archiveSession(ctx);

  return { stopped: true };
}

async function handleWorktreeCreate(
  args: Record<string, unknown>,
): Promise<{ worktree: string }> {
  const agentName = args.agent as string;
  const branch = args.branch as string | undefined;
  if (!agentName) throw new Error('Agent name required');

  const branchName = branch ?? `uniflow/${agentName}`;
  const proc = Bun.spawn(
    ['git', 'worktree', 'add', '-b', branchName, `../.uniflow-worktrees/${agentName}`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await proc.exited;

  return { worktree: `../.uniflow-worktrees/${agentName}` };
}

async function handleWorktreeMerge(
  args: Record<string, unknown>,
): Promise<{ merged: boolean }> {
  const agentName = args.agent as string;
  if (!agentName) throw new Error('Agent name required');

  const worktreePath = `../.uniflow-worktrees/${agentName}`;

  // Merge worktree branch
  const merge = Bun.spawn(
    ['git', 'merge', '--no-ff', `uniflow/${agentName}`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await merge.exited;

  // Remove worktree
  const remove = Bun.spawn(
    ['git', 'worktree', 'remove', worktreePath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await remove.exited;

  // Delete branch
  const branchDelete = Bun.spawn(
    ['git', 'branch', '-d', `uniflow/${agentName}`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await branchDelete.exited;

  return { merged: true };
}
