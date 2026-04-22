// ── Core Types ────────────────────────────────────────────────────────

export interface TmuxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type TmuxRunner = (args: string[]) => Promise<TmuxResult>;

export type PaneState = 'idle' | 'busy' | 'dead' | 'unknown';

export interface PaneInfo {
  paneId: string;
  width: number;
  height: number;
  command: string;
  pid: number;
  dead: boolean;
}

// ── CLI Types ─────────────────────────────────────────────────────────

export const CLI_TYPES = ['claude', 'codex'] as const;
export type CliType = (typeof CLI_TYPES)[number];

export const INTERRUPT_KEY: Record<CliType, string> = {
  claude: 'C-c',
  codex: 'Escape',
};

export const SUBMIT_PRESSES: Record<CliType, number> = {
  claude: 1,
  codex: 2,
};

// ── Capture Options ───────────────────────────────────────────────────

export interface CaptureOptions {
  /** Skip -J (join lines) flag — preserve raw TUI layout */
  raw?: boolean;
  /** Include ANSI escape sequences (-e flag) */
  ansi?: boolean;
  /** Capture full scrollback history (-S -) */
  history?: boolean;
  /** Number of history lines (-S -N) */
  historyLines?: number;
}

export interface StableCaptureOptions extends CaptureOptions {
  /** Max retry attempts (default 15) */
  maxAttempts?: number;
  /** Poll interval in ms (default 200) */
  intervalMs?: number;
}

export interface StableCaptureResult {
  output: string;
  stabilized: boolean;
  attempts: number;
}
