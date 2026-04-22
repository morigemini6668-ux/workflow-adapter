import type { CliType } from './types.js';
import { SUBMIT_PRESSES } from './types.js';
import { tmux, tmuxOk } from './runner.js';
import { capturePane } from './capture.js';
import { sleep } from './sleep.js';

/**
 * Send text to a pane via paste-buffer (safer than send-keys -l).
 * Avoids the Esc,Esc send-keys bug in Claude Code.
 */
export async function pasteText(paneId: string, text: string): Promise<void> {
  await tmuxOk(['set-buffer', text]);
  await tmuxOk(['paste-buffer', '-t', paneId, '-p']);
}

/** Send raw tmux key names (Enter, Tab, Up, Down, C-c, etc.). */
export async function sendKeys(paneId: string, ...keys: string[]): Promise<void> {
  await tmux(['send-keys', '-t', paneId, ...keys]);
}

/** Send literal text via send-keys -l (no key name interpretation). */
export async function sendLiteral(paneId: string, text: string): Promise<void> {
  await tmux(['send-keys', '-l', '-t', paneId, '--', text]);
}

/** Press Enter the appropriate number of times for the CLI type. */
export async function pressSubmit(paneId: string, cli: CliType = 'claude'): Promise<void> {
  const presses = SUBMIT_PRESSES[cli];
  for (let i = 0; i < presses; i++) {
    if (i > 0) await sleep(150);
    await tmux(['send-keys', '-t', paneId, 'C-m']);
  }
}

/**
 * Full message delivery: paste-buffer → submit → verify delivery.
 * If the message probe is still visible after submit, retries once.
 */
export async function sendMessage(
  paneId: string,
  cli: CliType,
  message: string,
): Promise<void> {
  await pasteText(paneId, message);
  await sleep(150);
  await pressSubmit(paneId, cli);

  // Verify delivery
  await sleep(200);
  const captured = await capturePane(paneId, 3);
  const probe = message.slice(0, 40);
  if (captured.includes(probe)) {
    await pressSubmit(paneId, cli);
  }
}
