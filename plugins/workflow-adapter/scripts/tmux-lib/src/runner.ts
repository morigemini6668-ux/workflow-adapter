import type { TmuxResult, TmuxRunner } from './types.js';

// ── Test seam ─────────────────────────────────────────────────────────

let _runner: TmuxRunner | null = null;

/** Replace the tmux runner for testing. Returns a restore function. */
export function _setRunner(runner: TmuxRunner): () => void {
  _runner = runner;
  return () => { _runner = null; };
}

// ── Core tmux executor ────────────────────────────────────────────────

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
export async function tmuxOk(args: string[]): Promise<string> {
  const result = await tmux(args);
  if (result.exitCode !== 0) {
    throw new Error(`tmux ${args[0]} failed: ${result.stderr}`);
  }
  return result.stdout;
}
