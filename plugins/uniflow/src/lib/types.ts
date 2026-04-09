import { z } from "zod";

// ── CLI Types ──────────────────────────────────────────────────────────

export const CLI_TYPES = ["claude", "codex"] as const;
export type CliType = (typeof CLI_TYPES)[number];
export const CliTypeSchema = z.enum(CLI_TYPES);

// ── Agent State ────────────────────────────────────────────────────────

export const AGENT_STATES = ["starting", "idle", "working", "blocked", "done", "failed"] as const;
export type AgentStateName = (typeof AGENT_STATES)[number];

export const AgentStateSchema = z.object({
  name: z.string(),
  cli: CliTypeSchema,
  role: z.string(),
  pane_id: z.string(),
  pid: z.number(),
  state: z.enum(AGENT_STATES),
  current_task: z.string().nullable(),
  progress: z.string().nullable(),
  nudge_count: z.number(),
  started_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

// ── Task ───────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["pending", "in_progress", "completed", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TaskSchema = z.object({
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(TASK_STATUSES),
  assignee: z.string().nullable(),
  priority: z.number().min(1).max(5),
  depends_on: z.array(z.string()),
  created_at: z.string().datetime(),
  assigned_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  result: z.string().nullable(),
  error: z.string().nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

// ── Outbox Entry ───────────────────────────────────────────────────────

export const OutboxEntrySchema = z.object({
  agent: z.string(),
  task: z.string(),
  status: z.enum(["completed", "failed"]),
  summary: z.string(),
  error: z.string().optional(),
  files_changed: z.array(z.string()).optional(),
  timestamp: z.string().datetime(),
});

export type OutboxEntry = z.infer<typeof OutboxEntrySchema>;

// ── Daemon IPC Protocol ────────────────────────────────────────────────

export const DAEMON_COMMANDS = [
  "spawn",
  "kill",
  "assign",
  "send",
  "status",
  "agents",
  "tasks",
  "logs",
  "peek",
  "nudge",
  "respawn",
  "stop",
  "worktree-create",
  "worktree-merge",
] as const;
export type DaemonCommand = (typeof DAEMON_COMMANDS)[number];

export const DaemonRequestSchema = z.object({
  command: z.string(),
  args: z.record(z.unknown()),
  requestId: z.string(),
});

export type DaemonRequest = z.infer<typeof DaemonRequestSchema>;

export const DaemonResponseSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type DaemonResponse = z.infer<typeof DaemonResponseSchema>;

// ── Dispatch Options ───────────────────────────────────────────────────

export const DISPATCH_MODES = ["interrupt", "nudge"] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

export const DispatchOptionsSchema = z.object({
  mode: z.enum(DISPATCH_MODES),
  message: z.string().max(60),
});

export type DispatchOptions = z.infer<typeof DispatchOptionsSchema>;

// ── CLI-specific Constants ─────────────────────────────────────────────

export const INTERRUPT_KEY: Record<CliType, string> = {
  claude: "C-c",
  codex: "Escape",
};

export const SUBMIT_PRESSES: Record<CliType, number> = {
  claude: 1,
  codex: 2,
};

// ── Worker Mode ────────────────────────────────────────────────────────

export const WORKER_MODES = ["interactive", "non_interactive"] as const;
export type WorkerMode = (typeof WORKER_MODES)[number];

// ── Session ────────────────────────────────────────────────────────────

export const SESSION_STATUSES = ["active", "stopped", "archived"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionAgentSchema = z.object({
  name: z.string(),
  cli: CliTypeSchema,
  role: z.string(),
  pane_id: z.string(),
  pid: z.number(),
});

export type SessionAgent = z.infer<typeof SessionAgentSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  project: z.string(),
  created_at: z.string().datetime(),
  status: z.enum(SESSION_STATUSES),
  tmux_session: z.string(),
  cwd: z.string(),
  agents: z.array(SessionAgentSchema),
  daemon_pid: z.number(),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Global Config ──────────────────────────────────────────────────────

export const GlobalConfigSchema = z.object({
  default_cli: CliTypeSchema.default("claude"),
  default_worker_count: z.number().min(1).max(5).default(2),
  auto_dismiss_trust: z.boolean().default(true),
  nudge_delay_ms: z.number().default(30000),
  nudge_max_count: z.number().default(3),
  health_poll_interval_ms: z.number().default(5000),
  log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// ── Event Log ──────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  "session_started",
  "session_stopped",
  "agent_spawned",
  "agent_killed",
  "agent_crashed",
  "agent_status_change",
  "agent_nudged",
  "agent_respawned",
  "task_created",
  "task_assigned",
  "task_completed",
  "task_failed",
  "message_sent",
  "inbox_written",
  "error",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EventSchema = z.object({
  ts: z.string().datetime(),
  type: z.enum(EVENT_TYPES),
  data: z.record(z.unknown()),
});

export type Event = z.infer<typeof EventSchema>;
