import { randomUUID } from "node:crypto";
import { appendFile, rename as fsRename, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, atomicWriteJSON } from "../lib/atomic-write.js";
import {
  agentsDir,
  archiveDir,
  inboxesDir,
  projectDir,
  sessionDir,
  tasksDir,
} from "../lib/constants.js";
import {
  type AgentState,
  AgentStateSchema,
  type Event,
  EventSchema,
  type EventType,
  type OutboxEntry,
  OutboxEntrySchema,
  type Session,
  SessionSchema,
  type SessionStatus,
  type Task,
  TaskSchema,
} from "../lib/types.js";

// ── Session Context ───────────────────────────────────────────────────

export interface SessionContext {
  project: string;
  sessionId: string;
}

function sessDir(ctx: SessionContext): string {
  return sessionDir(ctx.project, ctx.sessionId);
}

function sessionJsonPath(ctx: SessionContext): string {
  return join(sessDir(ctx), "session.json");
}

function agentPath(ctx: SessionContext, name: string): string {
  return join(agentsDir(ctx.project, ctx.sessionId), `${name}.json`);
}

function inboxPath(ctx: SessionContext, name: string): string {
  return join(inboxesDir(ctx.project, ctx.sessionId), `${name}.md`);
}

function taskPath(ctx: SessionContext, id: string): string {
  return join(tasksDir(ctx.project, ctx.sessionId), `${id}.json`);
}

function outboxPath(ctx: SessionContext): string {
  return join(sessDir(ctx), "outbox.jsonl");
}

function eventsPath(ctx: SessionContext): string {
  return join(sessDir(ctx), "events.jsonl");
}

// ── Session Lifecycle ─────────────────────────────────────────────────

export interface CreateSessionOptions {
  project: string;
  cwd: string;
  tmuxSession: string;
  daemonPid: number;
  here?: boolean;
  pluginDirs?: string[];
}

/**
 * Create a new session: generate UUID, create directory tree, write session.json.
 */
export async function createSession(opts: CreateSessionOptions): Promise<Session> {
  const sessionId = randomUUID();
  const ctx: SessionContext = { project: opts.project, sessionId };
  const base = sessDir(ctx);

  // Create all subdirectories
  await Promise.all([
    mkdir(join(base, "agents"), { recursive: true }),
    mkdir(join(base, "inboxes"), { recursive: true }),
    mkdir(join(base, "tasks"), { recursive: true }),
    mkdir(join(base, "logs"), { recursive: true }),
  ]);

  const session: Session = {
    id: sessionId,
    project: opts.project,
    created_at: new Date().toISOString(),
    status: "active",
    tmux_session: opts.tmuxSession,
    cwd: opts.cwd,
    agents: [],
    daemon_pid: opts.daemonPid,
    here: opts.here ?? false,
    pluginDirs: opts.pluginDirs ?? [],
  };

  await atomicWriteJSON(sessionJsonPath(ctx), session);

  // Initialize empty outbox and events files
  await Bun.write(outboxPath(ctx), "");
  await Bun.write(eventsPath(ctx), "");

  return session;
}

/**
 * Load existing session from disk.
 */
export async function loadSession(project: string, sessionId: string): Promise<Session> {
  const ctx: SessionContext = { project, sessionId };
  const raw = await readFile(sessionJsonPath(ctx), "utf-8");
  return SessionSchema.parse(JSON.parse(raw));
}

/**
 * Find the active session for a project (scan sessions/ directory).
 * Returns null if no active session exists.
 */
export async function findActiveSession(project: string): Promise<Session | null> {
  const sessionsBase = join(projectDir(project), "sessions");
  try {
    const entries = await readdir(sessionsBase);
    // Check most recent first (reverse sort by name = UUID, roughly chronological)
    for (const entry of entries.reverse()) {
      try {
        const session = await loadSession(project, entry);
        if (session.status === "active") return session;
      } catch {
        // Skip invalid/corrupt session files
      }
    }
  } catch {
    // sessions/ doesn't exist yet
  }
  return null;
}

/**
 * Update session.json fields atomically.
 */
export async function updateSession(
  ctx: SessionContext,
  updates: Partial<Omit<Session, "id" | "project" | "created_at">>,
): Promise<Session> {
  const current = await loadSession(ctx.project, ctx.sessionId);
  const updated = SessionSchema.parse({ ...current, ...updates });
  await atomicWriteJSON(sessionJsonPath(ctx), updated);
  return updated;
}

/**
 * Archive session: move session directory to archive/{sessionId}/.
 */
export async function archiveSession(ctx: SessionContext): Promise<void> {
  const src = sessDir(ctx);
  const dest = archiveDir(ctx.project, ctx.sessionId);
  await mkdir(join(dest, ".."), { recursive: true });

  // Update status before moving
  await updateSession(ctx, { status: "archived" as SessionStatus });
  await fsRename(src, dest);
}

/**
 * Recover session after daemon crash: reload session, validate agent panes.
 * Returns updated session with stale agents marked.
 */
export async function recoverSession(ctx: SessionContext): Promise<Session> {
  const session = await loadSession(ctx.project, ctx.sessionId);

  // Re-read all agent states from disk to get latest info
  const agentStates = await listAgents(ctx);
  const updatedAgents = session.agents.map((sa) => {
    const state = agentStates.find((a) => a.name === sa.name);
    if (state) {
      return { ...sa, pane_id: state.pane_id, pid: state.pid };
    }
    return sa;
  });

  return updateSession(ctx, { agents: updatedAgents });
}

// ── Agent State ───────────────────────────────────────────────────────

/**
 * Read and validate an agent's state file.
 */
export async function readAgentState(ctx: SessionContext, name: string): Promise<AgentState> {
  const raw = await readFile(agentPath(ctx, name), "utf-8");
  return AgentStateSchema.parse(JSON.parse(raw));
}

/**
 * Write agent state atomically.
 */
export async function writeAgentState(
  ctx: SessionContext,
  name: string,
  state: AgentState,
): Promise<void> {
  AgentStateSchema.parse(state); // Validate before writing
  await atomicWriteJSON(agentPath(ctx, name), state);
}

/**
 * List all agents in the session.
 */
export async function listAgents(ctx: SessionContext): Promise<AgentState[]> {
  const dir = agentsDir(ctx.project, ctx.sessionId);
  try {
    const files = await readdir(dir);
    const agents: AgentState[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(dir, file), "utf-8");
        agents.push(AgentStateSchema.parse(JSON.parse(raw)));
      } catch {
        // Skip corrupt agent files
      }
    }
    return agents;
  } catch {
    return [];
  }
}

/**
 * Remove agent state file.
 */
export async function removeAgentState(ctx: SessionContext, name: string): Promise<void> {
  await rm(agentPath(ctx, name), { force: true });
}

// ── Tasks ─────────────────────────────────────────────────────────────

/**
 * Read and validate a task file.
 */
export async function readTask(ctx: SessionContext, id: string): Promise<Task> {
  const raw = await readFile(taskPath(ctx, id), "utf-8");
  return TaskSchema.parse(JSON.parse(raw));
}

/**
 * Write task atomically.
 */
export async function writeTask(ctx: SessionContext, id: string, task: Task): Promise<void> {
  TaskSchema.parse(task); // Validate before writing
  await atomicWriteJSON(taskPath(ctx, id), task);
}

/**
 * List all tasks, optionally filtered by status.
 */
export async function listTasks(
  ctx: SessionContext,
  statusFilter?: Task["status"],
): Promise<Task[]> {
  const dir = tasksDir(ctx.project, ctx.sessionId);
  try {
    const files = await readdir(dir);
    const tasks: Task[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(dir, file), "utf-8");
        const task = TaskSchema.parse(JSON.parse(raw));
        if (!statusFilter || task.status === statusFilter) {
          tasks.push(task);
        }
      } catch {
        // Skip corrupt task files
      }
    }
    return tasks.sort((a, b) => a.priority - b.priority);
  } catch {
    return [];
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────

/**
 * Read agent inbox content.
 */
export async function readInbox(ctx: SessionContext, name: string): Promise<string> {
  try {
    return await readFile(inboxPath(ctx, name), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Write agent inbox atomically.
 */
export async function writeInbox(
  ctx: SessionContext,
  name: string,
  content: string,
): Promise<void> {
  await atomicWrite(inboxPath(ctx, name), content);
}

/**
 * Clear agent inbox.
 */
export async function clearInbox(ctx: SessionContext, name: string): Promise<void> {
  await atomicWrite(inboxPath(ctx, name), "");
}

// ── Outbox (cursor-based) ─────────────────────────────────────────────

/**
 * Cursor-based reader for outbox.jsonl.
 * Tracks byte offset to only return new entries since last read.
 */
export class OutboxReader {
  private cursor = 0;
  private readonly path: string;

  constructor(ctx: SessionContext) {
    this.path = outboxPath(ctx);
  }

  /**
   * Read new outbox entries since last cursor position.
   * Updates cursor to end of file.
   */
  async readNew(): Promise<OutboxEntry[]> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) return [];

    const content = await file.text();
    if (content.length <= this.cursor) return [];

    const newContent = content.slice(this.cursor);
    this.cursor = content.length;

    const entries: OutboxEntry[] = [];
    for (const line of newContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(OutboxEntrySchema.parse(JSON.parse(trimmed)));
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  }

  /**
   * Get current cursor position (byte offset).
   */
  getCursor(): number {
    return this.cursor;
  }

  /**
   * Reset cursor to a specific position.
   */
  setCursor(position: number): void {
    this.cursor = position;
  }
}

/**
 * Append an entry to outbox.jsonl using O_APPEND for safe concurrent writes.
 * Used by agents (via CLI helper) — each line must be < 4KB for atomic guarantee.
 */
export async function appendOutbox(ctx: SessionContext, entry: OutboxEntry): Promise<void> {
  OutboxEntrySchema.parse(entry);
  const line = `${JSON.stringify(entry)}\n`;
  const p = outboxPath(ctx);
  await mkdir(join(p, ".."), { recursive: true });
  await appendFile(p, line, "utf-8");
}

// ── Events ────────────────────────────────────────────────────────────

/**
 * Append event to events.jsonl.
 */
export async function appendEvent(
  ctx: SessionContext,
  type: EventType,
  data: Record<string, unknown>,
): Promise<void> {
  const event: Event = {
    ts: new Date().toISOString(),
    type,
    data,
  };
  EventSchema.parse(event);
  const line = `${JSON.stringify(event)}\n`;
  await appendFile(eventsPath(ctx), line, "utf-8");
}

/**
 * Read all events from events.jsonl.
 * Optionally filter by timestamp (ISO string).
 */
export async function readEvents(ctx: SessionContext, since?: string): Promise<Event[]> {
  try {
    const content = await readFile(eventsPath(ctx), "utf-8");
    const events: Event[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = EventSchema.parse(JSON.parse(trimmed));
        if (since && event.ts < since) continue;
        events.push(event);
      } catch {
        // Skip malformed lines
      }
    }
    return events;
  } catch {
    return [];
  }
}
