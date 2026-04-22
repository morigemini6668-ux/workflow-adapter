import { tmux, tmuxOk } from './runner.js';

/** Start logging pane output to a file via pipe-pane. */
export async function startPaneLog(paneId: string, logPath: string): Promise<void> {
  await tmuxOk(['pipe-pane', '-t', paneId, '-o', `cat >> "${logPath}"`]);
}

/** Stop pipe-pane logging. */
export async function stopPaneLog(paneId: string): Promise<void> {
  await tmux(['pipe-pane', '-t', paneId]);
}
