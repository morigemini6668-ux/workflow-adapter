import type { CliType, PaneInfo } from './types.js';
import { INTERRUPT_KEY } from './types.js';
import { tmux, tmuxOk } from './runner.js';
import { sleep } from './sleep.js';

/** Check if a pane's process has exited. */
export async function isPaneDead(paneId: string): Promise<boolean> {
  const result = await tmux(['list-panes', '-t', paneId, '-F', '#{pane_dead}']);
  if (result.exitCode !== 0) return true; // Pane doesn't exist
  return result.stdout === '1';
}

/** Get pane PID. */
export async function getPanePid(paneId: string): Promise<number> {
  const result = await tmuxOk(['list-panes', '-t', paneId, '-F', '#{pane_pid}']);
  return parseInt(result, 10);
}

/** Get detailed pane info. */
export async function getPaneInfo(paneId: string): Promise<PaneInfo> {
  const format = '#{pane_id}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_pid}\t#{pane_dead}';
  const result = await tmuxOk(['list-panes', '-t', paneId, '-F', format]);
  const [id, w, h, cmd, pid, dead] = result.split('\t');
  return {
    paneId: id,
    width: parseInt(w, 10),
    height: parseInt(h, 10),
    command: cmd,
    pid: parseInt(pid, 10),
    dead: dead === '1',
  };
}

/**
 * Create a new pane by splitting horizontally.
 * Returns the pane_id (e.g. "%42").
 */
export async function createPane(
  target: string,
  command: string,
  cwd: string,
): Promise<string> {
  return tmuxOk([
    'split-window', '-h',
    '-t', target,
    '-d',
    '-P', '-F', '#{pane_id}',
    '-c', cwd,
    command,
  ]);
}

/**
 * 3-step graceful pane shutdown:
 * 1. Send CLI-specific interrupt key
 * 2. Wait, then send C-d (EOF)
 * 3. If still alive, force kill-pane
 */
export async function killPane(paneId: string, cli: CliType = 'claude'): Promise<void> {
  const interruptKey = INTERRUPT_KEY[cli];
  await tmux(['send-keys', '-t', paneId, interruptKey]);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  await tmux(['send-keys', '-t', paneId, 'C-d']);
  await sleep(500);

  if (await isPaneDead(paneId)) return;

  await tmux(['kill-pane', '-t', paneId]);
}

/** Force kill a pane immediately. */
export async function forceKillPane(paneId: string): Promise<void> {
  await tmux(['kill-pane', '-t', paneId]);
}

/** Resize a pane to specific dimensions. */
export async function resizePane(paneId: string, width: number, height: number): Promise<void> {
  await tmuxOk(['resize-pane', '-t', paneId, '-x', String(width), '-y', String(height)]);
}

/** Get pane display message. */
export async function displayMessage(paneId: string, format: string): Promise<string> {
  return tmuxOk(['display-message', '-p', '-t', paneId, format]);
}
