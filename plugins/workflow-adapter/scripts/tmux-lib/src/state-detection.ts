import type { PaneState } from './types.js';
import { capturePane } from './capture.js';
import { isPaneDead } from './pane.js';

/**
 * Classify pane output into a state without any I/O.
 * Pure function — exported for testability.
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

/** Detect agent state by examining pane output. */
export async function detectState(paneId: string): Promise<PaneState> {
  if (await isPaneDead(paneId)) return 'dead';
  const output = await capturePane(paneId, 10);
  return classifyOutput(output);
}
