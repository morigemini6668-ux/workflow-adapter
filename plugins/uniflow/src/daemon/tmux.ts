import { INTERRUPT_KEY, SUBMIT_PRESSES, type CliType } from '../lib/types.js';
import { AGENT_READY_TIMEOUT_MS } from '../lib/constants.js';

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
  return () => { _runner = null; };
}

/**
 * Execute a tmux command via Bun.spawn (or test runner).
 * Returns stdout/stderr/exitCode.
 */
export async function tmux(args: string[]): Promise<TmuxResult> {
  if (_runner) return _runner(args);

  const proc = Bun.spawn(['tmux', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
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
 * Create a new tmux session (detached).
 */
export async function createSession(name: string, cwd: string): Promise<void> {
  await tmuxOk(['new-session', '-d', '-s', name, '-c', cwd]);
}

/**
 * Check if a tmux session exists.
 */
export async function hasSession(name: string): Promise<boolean> {
  const result = await tmux(['has-session', '-t', name]);
  return result.exitCode === 0;
}

/**
 * Kill a tmux session.
 */
export async function killSession(name: string): Promise<void> {
  await tmux(['kill-session', '-t', name]);
}

// ── Pane Management ───────────────────────────────────────────────────

/**
 * Create a new pane by splitting, running a command.
 * Returns the pane_id (e.g. "%42").
 */
export async function createPane(
  session: string,
  command: string,
  cwd: string,
): Promise<string> {
  const paneId = await tmuxOk([
    'split-window',
    '-h',
    '-t', session,
    '-d',
    '-P', '-F', '#{pane_id}',
    '-c', cwd,
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
export async function killPane(paneId: string, cli: CliType = 'claude'): Promise<void> {
  // Step 1: Send interrupt
  const interruptKey = INTERRUPT_KEY[cli];
  await tmux(['send-keys', '-t', paneId, interruptKey]);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  // Step 2: Send EOF
  await tmux(['send-keys', '-t', paneId, 'C-d']);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  // Step 3: Force kill
  await tmux(['kill-pane', '-t', paneId]);
}

/**
 * Check if a pane's process has exited.
 */
export async function isPaneDead(paneId: string): Promise<boolean> {
  const result = await tmux([
    'list-panes', '-t', paneId,
    '-F', '#{pane_dead}',
  ]);
  if (result.exitCode !== 0) return true; // Pane doesn't exist
  return result.stdout === '1';
}

/**
 * Get pane PID.
 */
export async function getPanePid(paneId: string): Promise<number> {
  const result = await tmuxOk([
    'list-panes', '-t', paneId,
    '-F', '#{pane_pid}',
  ]);
  return parseInt(result, 10);
}

// ── Text Delivery ─────────────────────────────────────────────────────

/**
 * Send text to a pane via paste-buffer (safer than send-keys -l).
 * Avoids the Esc,Esc send-keys bug in Claude Code.
 */
async function pasteText(paneId: string, text: string): Promise<void> {
  // set-buffer loads text into tmux buffer, paste-buffer sends it to pane
  await tmuxOk(['set-buffer', text]);
  await tmuxOk(['paste-buffer', '-t', paneId, '-p']);
}

/**
 * Submit (press Enter) the appropriate number of times for the CLI.
 */
async function pressSubmit(paneId: string, cli: CliType): Promise<void> {
  const presses = SUBMIT_PRESSES[cli];
  for (let i = 0; i < presses; i++) {
    if (i > 0) await sleep(150);
    await tmux(['send-keys', '-t', paneId, 'C-m']);
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
export async function sendMessage(
  paneId: string,
  cli: CliType,
  message: string,
): Promise<void> {
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

// ── Capture & Detection ───────────────────────────────────────────────

/**
 * Capture visible pane content (last N lines).
 */
export async function capturePane(paneId: string, lines = 40): Promise<string> {
  return tmuxOk([
    'capture-pane', '-p', '-J',
    '-t', paneId,
    '-S', `-${lines}`,
  ]);
}

/** Detected pane state */
export type PaneState = 'idle' | 'busy' | 'dead' | 'unknown';

/**
 * Classify pane output into a state without any I/O.
 * Exported for testability (pure function).
 */
export function classifyOutput(output: string): 'idle' | 'busy' | 'unknown' {
  const lastLines = output.split('\n').filter((l) => l.trim()).slice(-5);
  const tail = lastLines.join('\n');

  // Claude Code idle indicators
  if (tail.includes('❯') || tail.includes('$') || tail.match(/>\s*$/)) {
    return 'idle';
  }

  // Codex idle indicators
  if (tail.includes('codex>') || tail.includes('> ') || tail.includes('›')) {
    return 'idle';
  }

  // Working indicators (progress spinners, tool calls)
  if (tail.includes('⠋') || tail.includes('⠙') || tail.includes('⠹') ||
      tail.includes('Running') || tail.includes('Thinking')) {
    return 'busy';
  }

  return 'unknown';
}

/**
 * Detect agent state by examining pane output.
 * Looks for CLI-specific idle indicators.
 */
export async function detectState(paneId: string): Promise<PaneState> {
  if (await isPaneDead(paneId)) return 'dead';
  const output = await capturePane(paneId, 10);
  return classifyOutput(output);
}

// ── Readiness Polling ─────────────────────────────────────────────────

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
 * Uses exponential backoff polling (150ms → 8s).
 * Auto-dismisses trust prompts by sending C-m.
 */
export async function waitForReady(
  paneId: string,
  timeout = AGENT_READY_TIMEOUT_MS,
): Promise<void> {
  const startTime = Date.now();
  let delay = 150; // Start at 150ms
  const maxDelay = 8000;

  while (Date.now() - startTime < timeout) {
    if (await isPaneDead(paneId)) {
      throw new Error(`Pane ${paneId} died while waiting for ready`);
    }

    const output = await capturePane(paneId, 20);

    // Check for trust prompts — auto-dismiss with Enter
    for (const pattern of TRUST_PATTERNS) {
      if (pattern.test(output)) {
        await tmux(['send-keys', '-t', paneId, 'C-m']);
        await sleep(500);
        break;
      }
    }

    // Check if agent is ready (showing prompt)
    const state = await detectState(paneId);
    if (state === 'idle') return;

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
  await tmuxOk(['pipe-pane', '-t', paneId, '-o', `cat >> "${logPath}"`]);
}

/**
 * Stop pipe-pane logging.
 */
export async function stopPaneLog(paneId: string): Promise<void> {
  await tmux(['pipe-pane', '-t', paneId]);
}

// ── Layout ────────────────────────────────────────────────────────────

/**
 * Apply main-vertical layout to session window.
 */
export async function applyLayout(session: string): Promise<void> {
  await tmux(['select-layout', '-t', `${session}:0`, 'main-vertical']);
}

// ── Utilities ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
