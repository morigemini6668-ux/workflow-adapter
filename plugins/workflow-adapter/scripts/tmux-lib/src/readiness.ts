import { tmux } from './runner.js';
import { capturePane } from './capture.js';
import { isPaneDead } from './pane.js';
import { detectState } from './state-detection.js';
import { sleep } from './sleep.js';

/** Patterns that indicate a trust/permission prompt needing auto-dismiss */
export const TRUST_PATTERNS = [
  /Trust this project/i,
  /Do you trust/i,
  /press enter/i,
  /Type.*to continue/i,
  /bypass.*permissions/i,
];

/**
 * Wait for a pane to become ready (idle/prompt visible).
 * Auto-dismisses trust prompts by sending C-m.
 *
 * @param backoff 'exponential' (uniflow-style: 150ms→8s) or 'linear' (pane-ctl-style: 1s→5s)
 */
export async function waitForReady(
  paneId: string,
  timeoutMs = 30_000,
  backoff: 'exponential' | 'linear' = 'exponential',
): Promise<void> {
  const startTime = Date.now();
  let delay = backoff === 'exponential' ? 150 : 1000;
  const maxDelay = backoff === 'exponential' ? 8000 : 5000;

  while (Date.now() - startTime < timeoutMs) {
    if (await isPaneDead(paneId)) {
      throw new Error(`Pane ${paneId} died while waiting for ready`);
    }

    const output = await capturePane(paneId, 20);

    // Auto-dismiss trust prompts
    for (const pattern of TRUST_PATTERNS) {
      if (pattern.test(output)) {
        await tmux(['send-keys', '-t', paneId, 'C-m']);
        await sleep(backoff === 'exponential' ? 500 : 1000);
        break;
      }
    }

    const state = await detectState(paneId);
    if (state === 'idle') return;

    await sleep(delay);
    if (backoff === 'exponential') {
      delay = Math.min(delay * 2, maxDelay);
    } else {
      delay = Math.min(delay + 1000, maxDelay);
    }
  }

  throw new Error(`Pane ${paneId} did not become ready within ${timeoutMs}ms`);
}
