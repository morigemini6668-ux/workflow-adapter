import type { CaptureOptions, StableCaptureOptions, StableCaptureResult } from './types.js';
import { tmuxOk } from './runner.js';
import { sleep } from './sleep.js';

/** Build tmux capture-pane flags from options. */
function buildCaptureFlags(opts: CaptureOptions = {}): string[] {
  const flags: string[] = ['capture-pane', '-p'];
  if (!opts.raw) flags.push('-J'); // join wrapped lines (skip for raw TUI)
  if (opts.ansi) flags.push('-e'); // include ANSI escapes
  if (opts.history) {
    flags.push('-S', '-');
  } else if (opts.historyLines != null) {
    flags.push('-S', `-${opts.historyLines}`);
  }
  return flags;
}

/** Capture visible pane content. Default: last 40 lines, joined. */
export async function capturePane(paneId: string, linesOrOpts?: number | CaptureOptions): Promise<string> {
  if (typeof linesOrOpts === 'number') {
    return tmuxOk(['capture-pane', '-p', '-J', '-t', paneId, '-S', `-${linesOrOpts}`]);
  }
  const flags = buildCaptureFlags(linesOrOpts);
  flags.push('-t', paneId);
  if (!linesOrOpts?.history && linesOrOpts?.historyLines == null) {
    flags.push('-S', '-40');
  }
  return tmuxOk(flags);
}

/**
 * Stable capture: retry until two consecutive captures match.
 * Guards against capturing a TUI mid-render (Ink, Bubbletea, etc.).
 */
export async function stableCapture(
  paneId: string,
  opts: StableCaptureOptions = {},
): Promise<StableCaptureResult> {
  const maxAttempts = opts.maxAttempts ?? 15;
  const intervalMs = opts.intervalMs ?? 200;

  let prev = '';
  let attempts = 0;

  while (attempts < maxAttempts) {
    const flags = buildCaptureFlags(opts);
    flags.push('-t', paneId);
    if (!opts.history && opts.historyLines == null) {
      flags.push('-S', '-40');
    }
    const output = await tmuxOk(flags);

    if (output === prev && output.length > 0) {
      return { output, stabilized: true, attempts };
    }
    prev = output;
    await sleep(intervalMs);
    attempts++;
  }

  return { output: prev, stabilized: false, attempts };
}
