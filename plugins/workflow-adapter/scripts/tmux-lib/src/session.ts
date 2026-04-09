import { tmux, tmuxOk } from './runner.js';

/** Get the current tmux session name. Returns null if not inside tmux. */
export async function currentSession(): Promise<string | null> {
  const result = await tmux(['display-message', '-p', '#{session_name}']);
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

/** Get "session:window" target for the current window. */
export async function currentWindowTarget(): Promise<string | null> {
  const result = await tmux(['display-message', '-p', '#{session_name}:#{window_index}']);
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

/** Create a new detached tmux session. */
export async function createSession(name: string, cwd: string): Promise<void> {
  await tmuxOk(['new-session', '-d', '-s', name, '-c', cwd]);
}

/** Create a new detached session with explicit size. */
export async function createSessionWithSize(
  name: string,
  cwd: string,
  width: number,
  height: number,
  command?: string,
): Promise<string> {
  const args = [
    'new-session', '-d', '-s', name,
    '-x', String(width), '-y', String(height),
    '-P', '-F', '#{pane_id}',
    '-c', cwd,
  ];
  if (command) args.push(command);
  return tmuxOk(args);
}

/** Check if a tmux session exists. */
export async function hasSession(name: string): Promise<boolean> {
  const result = await tmux(['has-session', '-t', name]);
  return result.exitCode === 0;
}

/** Kill a tmux session. */
export async function killSession(name: string): Promise<void> {
  await tmux(['kill-session', '-t', name]);
}
