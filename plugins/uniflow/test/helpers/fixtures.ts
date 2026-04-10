import type { AgentState, Task, Session, SessionAgent, OutboxEntry, Event } from "../../src/lib/types.js";

const now = () => new Date().toISOString();

export function makeAgentState(overrides?: Partial<AgentState>): AgentState {
  return {
    name: "worker-1",
    cli: "claude",
    role: "executor",
    pane_id: "%10",
    pid: 12345,
    state: "idle",
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

export function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    subject: "Test task",
    description: "A test task",
    status: "pending",
    assignee: null,
    priority: 3,
    depends_on: [],
    created_at: now(),
    assigned_at: null,
    completed_at: null,
    result: null,
    error: null,
    ...overrides,
  };
}

export function makeSessionAgent(overrides?: Partial<SessionAgent>): SessionAgent {
  return {
    name: "worker-1",
    cli: "claude",
    role: "executor",
    pane_id: "%10",
    pid: 12345,
    ...overrides,
  };
}

export function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: "sess-001",
    project: "test-project",
    created_at: now(),
    status: "active",
    tmux_session: "uniflow-test-project",
    cwd: "/tmp/test",
    agents: [],
    daemon_pid: 99999,
    here: false,
    pluginDirs: [],
    ...overrides,
  };
}

export function makeOutboxEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    agent: "worker-1",
    task: "task-1",
    status: "completed",
    summary: "Done",
    timestamp: now(),
    ...overrides,
  };
}

export function makeEvent(overrides?: Partial<Event>): Event {
  return {
    ts: now(),
    type: "agent_spawned",
    data: { name: "worker-1" },
    ...overrides,
  };
}
