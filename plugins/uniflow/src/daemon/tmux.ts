import { AGENT_READY_TIMEOUT_MS } from "../lib/constants.js";
import { type CliType, INTERRUPT_KEY, SUBMIT_PRESSES } from "../lib/types.js";

// ── Low-level tmux wrapper ────────────────────────────────────────────

export interface TmuxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type TmuxRunner = (args: string[]) => Promise<TmuxResult>;

let _runner: TmuxRunner | null = null;

/** Replace the tmux runner for testing. Returns a restore function. */
export function _setRunner(runner: TmuxRunner): () => void {
  _runner = runner;
  return () => {
    _runner = null;
  };
}

/**
 * Execute a tmux command via Bun.spawn (or test runner).
 * Returns stdout/stderr/exitCode.
 */
export async function tmux(args: string[]): Promise<TmuxResult> {
  if (_runner) return _runner(args);

  const proc = Bun.spawn(["tmux", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Execute tmux and throw on failure.
 */
async function tmuxOk(args: string[]): Promise<string> {
  const result = await tmux(args);
  if (result.exitCode !== 0) {
    throw new Error(`tmux ${args[0]} failed: ${result.stderr}`);
  }
  return result.stdout;
}

// ── Session Management ────────────────────────────────────────────────

/**
 * Get the current tmux session name (if running inside tmux).
 * Returns null if not inside a tmux session.
 */
export async function currentSession(): Promise<string | null> {
  const result = await tmux(["display-message", "-p", "#{session_name}"]);
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

/**
 * Get a target string for the current tmux window.
 * Returns "session:window" format for use with split-window.
 */
export async function currentWindowTarget(): Promise<string | null> {
  const result = await tmux(["display-message", "-p", "#{session_name}:#{window_index}"]);
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

/**
 * Create a new tmux session (detached).
 * @param windowName - Optional name for the initial window (tmux -n flag).
 */
export async function createSession(name: string, cwd: string, windowName?: string): Promise<void> {
  const args = ["new-session", "-d", "-s", name, "-c", cwd];
  if (windowName) args.push("-n", windowName);
  await tmuxOk(args);
}

/**
 * Check if a tmux session exists.
 */
export async function hasSession(name: string): Promise<boolean> {
  const result = await tmux(["has-session", "-t", name]);
  return result.exitCode === 0;
}

/**
 * Kill a tmux session.
 */
export async function killSession(name: string): Promise<void> {
  await tmux(["kill-session", "-t", name]);
}

// ── Window Management ────────────────────────────────────────────────

/**
 * Create a new tmux window in a session.
 * Returns the pane_id of the initial pane in the new window.
 * @param command - Optional command to run. If omitted, opens a shell.
 */
export async function createWindow(
  session: string,
  name: string,
  command: string | undefined,
  cwd: string,
): Promise<string> {
  const args = ["new-window", "-t", session, "-n", name, "-d", "-P", "-F", "#{pane_id}", "-c", cwd];
  if (command) args.push(command);
  return tmuxOk(args);
}

/**
 * Kill a named tmux window.
 */
export async function killWindow(session: string, windowName: string): Promise<void> {
  await tmux(["kill-window", "-t", `${session}:${windowName}`]);
}

// ── Pane Management ───────────────────────────────────────────────────

/**
 * Create a new pane by splitting, running a command.
 * Returns the pane_id (e.g. "%42").
 * @param targetWindow - Optional window name. If provided, splits within "session:windowName".
 * @param targetPane - Optional pane ID (e.g. "%42"). Takes priority over targetWindow.
 */
export async function createPane(
  session: string,
  command: string,
  cwd: string,
  targetWindow?: string,
  targetPane?: string,
): Promise<string> {
  const target = targetPane ?? (targetWindow ? `${session}:${targetWindow}` : session);
  const paneId = await tmuxOk([
    "split-window",
    "-h",
    "-t",
    target,
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    "-c",
    cwd,
    command,
  ]);
  return paneId;
}

/**
 * 3-step graceful pane shutdown:
 * 1. Send CLI-specific interrupt key (C-c or Escape)
 * 2. Wait, then send C-d (EOF)
 * 3. If still alive, force kill-pane
 */
export async function killPane(paneId: string, cli: CliType = "claude"): Promise<void> {
  // Step 1: Send interrupt
  const interruptKey = INTERRUPT_KEY[cli];
  await tmux(["send-keys", "-t", paneId, interruptKey]);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  // Step 2: Send EOF
  await tmux(["send-keys", "-t", paneId, "C-d"]);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  // Step 3: Force kill
  await tmux(["kill-pane", "-t", paneId]);
}

/**
 * Check if a pane's process has exited.
 */
export async function isPaneDead(paneId: string): Promise<boolean> {
  const result = await tmux(["list-panes", "-t", paneId, "-F", "#{pane_dead}"]);
  if (result.exitCode !== 0) return true; // Pane doesn't exist
  return result.stdout === "1";
}

/**
 * Get pane PID.
 */
export async function getPanePid(paneId: string): Promise<number> {
  const result = await tmuxOk(["list-panes", "-t", paneId, "-F", "#{pane_pid}"]);
  return parseInt(result, 10);
}

// ── Text Delivery ─────────────────────────────────────────────────────

/**
 * Send text to a pane via paste-buffer (safer than send-keys -l).
 * Avoids the Esc,Esc send-keys bug in Claude Code.
 */
async function pasteText(paneId: string, text: string): Promise<void> {
  // set-buffer loads text into tmux buffer, paste-buffer sends it to pane
  await tmuxOk(["set-buffer", text]);
  await tmuxOk(["paste-buffer", "-t", paneId, "-p"]);
}

/**
 * Submit (press Enter) the appropriate number of times for the CLI.
 */
async function pressSubmit(paneId: string, cli: CliType): Promise<void> {
  const presses = SUBMIT_PRESSES[cli];
  for (let i = 0; i < presses; i++) {
    if (i > 0) await sleep(150);
    await tmux(["send-keys", "-t", paneId, "C-m"]);
  }
}

/**
 * Full message delivery sequence for a pane.
 *
 * Phase 1: (optional) Interrupt if agent is busy
 * Phase 2: Small delay for buffer settling
 * Phase 3: Paste text via paste-buffer
 * Phase 4: Press Enter (CLI-specific count)
 * Phase 5: Verify delivery — retry submit if text retained in input area
 */
export async function sendMessage(paneId: string, cli: CliType, message: string): Promise<void> {
  // Phase 3: Paste the message text
  await pasteText(paneId, message);

  // Phase 4: Small delay then submit
  await sleep(150);
  await pressSubmit(paneId, cli);

  // Phase 5: Verify delivery — retry submit if text retained in input area
  await sleep(200);
  const captured = await capturePane(paneId, 3);
  const probe = message.slice(0, 40);
  if (captured.includes(probe)) {
    await pressSubmit(paneId, cli);
  }
}

// ── Batch Query ──────────────────────────────────────────────────────

export interface PaneBatchState {
  paneId: string;
  pid: number;
  dead: boolean;
  deadStatus: number;
  currentCommand: string;
  paneTitle: string;
  activity: number; // epoch seconds (may be 0 if pane_activity unavailable)
}

/**
 * Query all agent panes in one tmux call.
 * Replaces N × isPaneDead() + N × getPaneActivity() calls.
 *
 * Note: pane_activity returns empty in tmux 3.6a (macOS); Number('') → 0.
 * Tab characters in pane_title are a theoretical risk but not observed
 * in practice with Claude Code or Codex CLIs.
 */
export async function batchQueryPanes(
  tmuxSession: string,
): Promise<PaneBatchState[]> {
  const fmt = [
    "#{pane_id}",
    "#{pane_pid}",
    "#{pane_dead}",
    "#{pane_dead_status}",
    "#{pane_current_command}",
    "#{pane_title}",
    "#{pane_activity}",
  ].join("\t");

  let result: string;
  try {
    result = await tmuxOk(["list-panes", "-t", tmuxSession, "-F", fmt]);
  } catch {
    return []; // Session doesn't exist or no panes
  }

  return result
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [paneId, pid, dead, deadStatus, cmd, title, activity] = line.split("\t");
      return {
        paneId,
        pid: Number(pid),
        dead: dead === "1",
        deadStatus: Number(deadStatus),
        currentCommand: cmd,
        paneTitle: title,
        activity: Number(activity),
      };
    });
}

// ── Activity Tracking ────────────────────────────────────────────────

/**
 * Get the epoch timestamp of last output to a pane.
 * Uses tmux #{pane_activity} format variable — metadata only, no content capture.
 * Returns 0 if pane is dead or query fails.
 */
export async function getPaneActivity(paneId: string): Promise<number> {
  try {
    const result = await tmuxOk(["display-message", "-t", paneId, "-p", "#{pane_activity}"]);
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ── Capture & Detection ───────────────────────────────────────────────

/**
 * Capture visible pane content (last N lines).
 */
export async function capturePane(paneId: string, lines = 40): Promise<string> {
  return tmuxOk(["capture-pane", "-p", "-J", "-t", paneId, "-S", `-${lines}`]);
}

/** Detected pane state */
export type PaneState = "idle" | "busy" | "dead" | "unknown";

/**
 * Effective state for dispatch decisions.
 * D1: 'unknown' treated as 'busy' (conservative).
 */
export function effectiveState(state: PaneState): "idle" | "busy" | "dead" {
  if (state === "idle") return "idle";
  if (state === "dead") return "dead";
  return "busy"; // busy + unknown → busy
}

/**
 * Classify pane state from pane_title (zero-cost — already in batch query).
 *
 * Claude Code: `✳ {name}` = idle, `{braille} {name}` = busy
 * Codex: `{name}` (no prefix) = idle, `{braille} {name}` = busy
 *
 * Edge case: Claude Code team lead with active teammates shows spinner
 * even when own prompt is idle. Use as supplementary signal, not sole source.
 */
export function classifyByTitle(paneTitle: string): "idle" | "busy" | "unknown" {
  if (!paneTitle || paneTitle.length === 0) return "unknown";

  const firstChar = paneTitle.codePointAt(0) ?? 0;

  // ✳ (U+2733) = Claude Code idle
  if (firstChar === 0x2733) return "idle";

  // Braille Pattern block (U+2800–U+28FF) = busy spinner (both CLIs)
  if (firstChar >= 0x2800 && firstChar <= 0x28ff) return "busy";

  // No icon prefix (starts with ASCII letter) = Codex idle
  if (firstChar >= 0x41 && firstChar <= 0x7a) return "idle";

  return "unknown";
}

/**
 * Busy indicators validated against real terminal captures.
 *
 * Claude Code: Braille spinners + "Thinking"/"Running" keywords.
 * Codex v0.118: Bullet-prefixed tool calls (• Working, • Explored, etc.)
 *   — Braille spinners NOT used by Codex.
 *   — "Generating"/"Editing" etc. NOT observed in Codex output.
 */
const BUSY_PATTERNS = [
  // Claude Code — Braille spinner set (progress indicators)
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
  // Claude Code — semantic keywords
  "Thinking",
  "Running",
  // Codex v0.118 — bullet-prefixed tool actions (validated from captures)
  "• Working",
  "• Explored",
  "• Ran",
  "• Added",
  "• Edited",
  "• Removed",
];

/**
 * Classify pane output into a state without any I/O.
 * Exported for testability (pure function).
 */
export function classifyOutput(output: string): "idle" | "busy" | "unknown" {
  const lastLines = output
    .split("\n")
    .filter((l) => l.trim())
    .slice(-5);
  const tail = lastLines.join("\n");

  // Busy indicators FIRST — Codex always shows › prompt even when working,
  // so busy must take priority over idle to avoid false nudges.
  for (const pattern of BUSY_PATTERNS) {
    if (tail.includes(pattern)) return "busy";
  }

  // Claude Code idle indicators
  if (tail.includes("❯") || tail.includes("$") || tail.match(/>\s*$/)) {
    return "idle";
  }

  // Codex idle indicators
  if (tail.includes("codex>") || tail.includes("> ") || tail.includes("›")) {
    return "idle";
  }

  return "unknown";
}

/**
 * Detect agent state by examining pane output.
 * Looks for CLI-specific idle indicators.
 */
export async function detectState(paneId: string): Promise<PaneState> {
  if (await isPaneDead(paneId)) return "dead";
  const output = await capturePane(paneId, 10);
  return classifyOutput(output);
}

// ── wait-for Channel Primitives ──────────────────────────────────────

/**
 * Wait for a tmux wait-for channel with timeout.
 * Uses Bun.spawn (non-blocking) + setTimeout race.
 *
 * On timeout: KILLS the waiter process (SIGTERM) instead of signaling
 * the channel. This prevents a stale timeout signal from satisfying
 * a future wait on the same channel name. (D21)
 *
 * Returns true if channel was signaled, false if timeout.
 */
export async function waitForChannel(
  channel: string,
  timeoutMs: number,
): Promise<boolean> {
  const waiter = Bun.spawn(["tmux", "wait-for", channel], {
    stdout: "ignore",
    stderr: "ignore",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    waiter.kill(); // Kill the waiter process — do NOT signal the channel
  }, timeoutMs);

  await waiter.exited;
  clearTimeout(timer);
  return !timedOut;
}

/**
 * Signal a wait-for channel (wake up all waiters).
 */
export async function signalChannel(channel: string): Promise<void> {
  await tmux(["wait-for", "-S", channel]);
}

// ── tmux Hook Setup ──────────────────────────────────────────────────

/**
 * Register a pane-exited hook for a specific pane.
 *
 * tmux hook syntax: `set-hook -t <pane> pane-exited <command>`
 * - `-t <pane>` scopes the hook to that specific pane (not global) (D22)
 * - No need for run-shell pane_id filtering when using -t scoping
 *
 * The channel includes spawnId to prevent cross-spawn false positives. (D20)
 */
export async function registerExitHook(
  name: string,
  paneId: string,
  spawnId: string,
): Promise<void> {
  const channel = `agent-${name}-${spawnId}-exited`;
  await tmux([
    "set-hook",
    "-t",
    paneId,
    "pane-exited",
    `run-shell "tmux wait-for -S ${channel}"`,
  ]);
}

/**
 * Unregister pane-exited hook for a pane.
 * Called during respawn to clean up old hooks before re-registering.
 */
export async function unregisterExitHook(paneId: string): Promise<void> {
  await tmux(["set-hook", "-u", "-t", paneId, "pane-exited"]).catch(() => {});
}

/**
 * Wait for an agent's pane to exit, with timeout.
 * Uses spawnId-scoped channel to avoid false positives from prior spawns.
 */
export async function waitForExit(
  name: string,
  spawnId: string,
  timeoutMs = 30_000,
): Promise<boolean> {
  const channel = `agent-${name}-${spawnId}-exited`;
  return waitForChannel(channel, timeoutMs);
}

// ── Ready Signal ─────────────────────────────────────────────────────

/**
 * Build a pane command that launches the agent and signals readiness.
 *
 * Background poller: checks for idle prompt every 500ms via capture-pane,
 * signals the ready channel when found. (D23)
 * The poller runs in the pane's shell alongside the agent process.
 */
export function buildReadySignalCommand(
  agentCmd: string,
  readyChannel: string,
): string {
  // Background poller: check for idle prompt every 500ms, signal when found
  const poller = [
    "while true; do",
    '  OUT=$(tmux capture-pane -p -t "$TMUX_PANE" -S -5 2>/dev/null)',
    "  if echo \"$OUT\" | grep -qE '^(❯|\\$|›)\\s*$'; then",
    `    tmux wait-for -S ${readyChannel}; break`,
    "  fi",
    "  sleep 0.5",
    "done &",
  ].join(" ");
  return `${poller} ${agentCmd}`;
}

// ── Readiness ────────────────────────────────────────────────────────

/** Patterns that indicate a trust/permission prompt needing auto-dismiss */
const TRUST_PATTERNS = [
  /Trust this project/i,
  /Do you trust/i,
  /press enter/i,
  /Type.*to continue/i,
  /bypass.*permissions/i,
];

/**
 * Wait for a pane to become ready (idle/prompt visible).
 *
 * When spawnId is provided, uses wait-for channel with capture-pane fallback.
 * When spawnId is omitted, falls back to legacy polling (backward compat).
 *
 * Auto-dismisses trust prompts by sending C-m.
 */
export async function waitForReady(
  paneId: string,
  timeout = AGENT_READY_TIMEOUT_MS,
  name?: string,
  spawnId?: string,
): Promise<void> {
  // New path: wait-for channel with fallback
  if (name && spawnId) {
    const channel = `agent-${name}-${spawnId}-ready`;
    const ready = await waitForChannel(channel, timeout);

    if (!ready) {
      // Fallback: check if pane is idle via capture-pane
      const state = await detectState(paneId);
      if (state === "idle") return;
      if (state === "dead") throw new Error(`Pane ${paneId} died while waiting for ready`);
      throw new Error(`Agent ${name} did not become ready within ${timeout}ms`);
    }
    return;
  }

  // Legacy path: exponential backoff polling (for agents without spawnId)
  const startTime = Date.now();
  let delay = 150;
  const maxDelay = 8000;

  while (Date.now() - startTime < timeout) {
    if (await isPaneDead(paneId)) {
      throw new Error(`Pane ${paneId} died while waiting for ready`);
    }

    const output = await capturePane(paneId, 20);

    // Check for trust prompts — auto-dismiss with Enter
    for (const pattern of TRUST_PATTERNS) {
      if (pattern.test(output)) {
        await tmux(["send-keys", "-t", paneId, "C-m"]);
        await sleep(500);
        break;
      }
    }

    // Check if agent is ready (showing prompt)
    const state = await detectState(paneId);
    if (state === "idle") return;

    await sleep(delay);
    delay = Math.min(delay * 2, maxDelay);
  }

  throw new Error(`Pane ${paneId} did not become ready within ${timeout}ms`);
}

// ── Pipe-Pane Logging ─────────────────────────────────────────────────

/**
 * Start logging pane output to a file via pipe-pane.
 */
export async function startPaneLog(paneId: string, logPath: string): Promise<void> {
  await tmuxOk(["pipe-pane", "-t", paneId, "-o", `cat >> "${logPath}"`]);
}

/**
 * Stop pipe-pane logging.
 */
export async function stopPaneLog(paneId: string): Promise<void> {
  await tmux(["pipe-pane", "-t", paneId]);
}

// ── Utilities ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
