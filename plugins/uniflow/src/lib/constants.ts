import { homedir } from 'node:os';
import { join } from 'node:path';

// ── Paths ──────────────────────────────────────────────────────────────

export const UNIFLOW_HOME = join(homedir(), '.uniflow');
export const UNIFLOW_PROJECTS_DIR = join(UNIFLOW_HOME, 'projects');
export const UNIFLOW_SOCKETS_DIR = join(UNIFLOW_HOME, 'sockets');
export const UNIFLOW_CONFIG_PATH = join(UNIFLOW_HOME, 'config.json');
export const UNIFLOW_ID_FILE = '.uniflow-id';

// ── Path Helpers ───────────────────────────────────────────────────────

export function projectDir(projectName: string): string {
  return join(UNIFLOW_PROJECTS_DIR, projectName);
}

export function sessionDir(projectName: string, sessionId: string): string {
  return join(projectDir(projectName), 'sessions', sessionId);
}

export function agentsDir(projectName: string, sessionId: string): string {
  return join(sessionDir(projectName, sessionId), 'agents');
}

export function inboxesDir(projectName: string, sessionId: string): string {
  return join(sessionDir(projectName, sessionId), 'inboxes');
}

export function tasksDir(projectName: string, sessionId: string): string {
  return join(sessionDir(projectName, sessionId), 'tasks');
}

export function logsDir(projectName: string, sessionId: string): string {
  return join(sessionDir(projectName, sessionId), 'logs');
}

export function socketPath(projectName: string): string {
  return join(UNIFLOW_SOCKETS_DIR, `${projectName}.sock`);
}

export function archiveDir(projectName: string, sessionId: string): string {
  return join(projectDir(projectName), 'archive', sessionId);
}

// ── Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  default_cli: 'claude' as const,
  default_worker_count: 2,
  auto_dismiss_trust: true,
  nudge_delay_ms: 30_000,
  nudge_max_count: 3,
  health_poll_interval_ms: 5_000,
  log_level: 'info' as const,
};

// ── Limits ─────────────────────────────────────────────────────────────

export const MAX_WORKERS = 5;
export const MAX_INBOX_SIZE = 32 * 1024; // 32 KB
export const MAX_OUTBOX_LINE_SIZE = 4 * 1024; // 4 KB
export const AGENT_READY_TIMEOUT_MS = 30_000;
export const TMUX_MIN_VERSION = '3.3';

// ── tmux ───────────────────────────────────────────────────────────────

export function tmuxSessionName(projectName: string): string {
  return `uniflow-${projectName}`;
}

// ── Exit Codes ─────────────────────────────────────────────────────────

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_SESSION_EXISTS = 2;
export const EXIT_AGENT_NOT_FOUND = 3;
export const EXIT_TMUX_MISSING = 4;
