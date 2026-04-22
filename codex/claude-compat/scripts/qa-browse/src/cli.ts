/**
 * qa-browse CLI — thin wrapper that talks to the persistent server
 *
 * Flow:
 *   1. Read .workflow-adapter/qa-browse/server.json for port + token
 *   2. If missing or stale PID → start server in background
 *   3. Health check
 *   4. Send command via HTTP POST
 *   5. Print response to stdout (or stderr for errors)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import { resolveConfig, ensureStateDir } from './config';

const config = resolveConfig();
const MAX_START_WAIT = 8000;
const COMMAND_TIMEOUT_MS = 30000;
const LOCK_POLL_INTERVAL_MS = 100;
const START_LOCK_STALE_MS = MAX_START_WAIT * 2;
const COMMAND_LOCK_WAIT_MS = COMMAND_TIMEOUT_MS + MAX_START_WAIT + 5000;
const COMMAND_LOCK_STALE_MS = COMMAND_LOCK_WAIT_MS * 2;
const IS_WINDOWS = process.platform === 'win32';

function resolveServerScript(): string {
  if (process.env.QA_BROWSE_SERVER_SCRIPT) return process.env.QA_BROWSE_SERVER_SCRIPT;

  // Dev mode: cli.ts runs from src/
  if (import.meta.dir.startsWith('/') && !import.meta.dir.includes('$bunfs')) {
    const direct = path.resolve(import.meta.dir, 'server.ts');
    if (fs.existsSync(direct)) return direct;
  }

  // Compiled binary: derive from execPath
  if (process.execPath) {
    const adjacent = path.resolve(path.dirname(process.execPath), '..', 'src', 'server.ts');
    if (fs.existsSync(adjacent)) return adjacent;
  }

  throw new Error('Cannot find server.ts. Set QA_BROWSE_SERVER_SCRIPT env.');
}

const SERVER_SCRIPT = resolveServerScript();

interface ServerState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
}

class CommandFailure extends Error {}

function readState(): ServerState | null {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, 'utf-8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function isLockStale(lockFile: string, staleMs: number): boolean {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function clearStaleLock(lockFile: string, staleMs: number): void {
  if (!isLockStale(lockFile, staleMs)) return;
  try { fs.unlinkSync(lockFile); } catch {}
}

async function acquireLock(
  lockFile: string,
  staleMs: number,
  waitMs: number,
  label: string,
): Promise<() => void> {
  ensureStateDir(config);

  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    clearStaleLock(lockFile, staleMs);

    try {
      const fd = fs.openSync(lockFile, 'wx', 0o600);
      return () => {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(lockFile); } catch {}
      };
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }

    await Bun.sleep(LOCK_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function killServer(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) return;
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && isProcessAlive(pid)) await Bun.sleep(100);
  if (isProcessAlive(pid)) try { process.kill(pid, 'SIGKILL'); } catch {}
}

async function getHealthyServerState(timeoutMs = 2000): Promise<ServerState | null> {
  const state = readState();
  if (!state || !isProcessAlive(state.pid)) return null;

  try {
    const resp = await fetch(`http://127.0.0.1:${state.port}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const health = await resp.json() as any;
    if (health.status !== 'healthy') return null;
    return state;
  } catch {
    return null;
  }
}

async function startServer(): Promise<ServerState> {
  ensureStateDir(config);
  try { fs.unlinkSync(config.stateFile); } catch {}

  // On Windows, Bun cannot launch Playwright browsers due to missing named
  // pipe support (oven-sh/bun#13042). Fall back to Node + tsx as the server
  // runtime so Playwright works correctly.
  let serverCmd: string[];
  if (IS_WINDOWS) {
    // Resolve tsx from qa-browse's own node_modules so it works regardless of CWD.
    // --import requires file:// URLs on Windows (bare paths have 'c:' scheme error).
    const qaDir = path.dirname(path.dirname(SERVER_SCRIPT)); // qa-browse root
    const tsxPath = path.join(qaDir, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs');
    const tsxUrl = 'file:///' + tsxPath.replace(/\\/g, '/');
    serverCmd = ['node', '--import', tsxUrl, SERVER_SCRIPT];
  } else {
    serverCmd = ['bun', 'run', SERVER_SCRIPT];
  }

  let proc: ReturnType<typeof Bun.spawn> | null = null;
  if (IS_WINDOWS) {
    // Use Node child_process.spawn with detached:true so the server survives
    // after the CLI process exits. Bun.spawn doesn't reliably detach on Windows.
    const cp = nodeSpawn(serverCmd[0], serverCmd.slice(1), {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, QA_BROWSE_STATE_FILE: config.stateFile },
    });
    cp.unref();
  } else {
    proc = Bun.spawn(serverCmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, QA_BROWSE_STATE_FILE: config.stateFile },
    });
    proc.unref();
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_START_WAIT) {
    const healthy = await getHealthyServerState(1000);
    if (healthy) return healthy;
    await Bun.sleep(LOCK_POLL_INTERVAL_MS);
  }

  const stderr = proc?.stderr;
  if (stderr) {
    const reader = stderr.getReader();
    const { value } = await reader.read();
    if (value) throw new Error(`Server failed to start:\n${new TextDecoder().decode(value)}`);
  }
  throw new Error(`Server failed to start within ${MAX_START_WAIT / 1000}s`);
}

async function ensureServer(): Promise<ServerState> {
  const healthy = await getHealthyServerState();
  if (healthy) return healthy;

  const release = await acquireLock(
    config.lockFile,
    START_LOCK_STALE_MS,
    MAX_START_WAIT,
    'qa-browse startup',
  );
  try {
    const rechecked = await getHealthyServerState(1000);
    if (rechecked) return rechecked;

    console.error('[qa-browse] Starting server...');
    return startServer();
  } finally {
    release();
  }
}

async function restartServerAfterConnectionLoss(): Promise<ServerState> {
  const release = await acquireLock(
    config.lockFile,
    START_LOCK_STALE_MS,
    MAX_START_WAIT,
    'qa-browse restart',
  );
  try {
    const healthy = await getHealthyServerState(1000);
    if (healthy) return healthy;
    return startServer();
  } finally {
    release();
  }
}

function formatCommandError(text: string): string {
  try {
    const err = JSON.parse(text);
    if (err.hint) return `${err.error || text}\n${err.hint}`;
    return err.error || text;
  } catch {
    return text;
  }
}

async function sendCommand(state: ServerState, command: string, args: string[], retries = 0): Promise<void> {
  try {
    const resp = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ command, args }),
      signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
    });

    if (resp.status === 401) {
      console.error('[qa-browse] Auth failed — retrying...');
      const newState = readState();
      if (newState && newState.token !== state.token) return sendCommand(newState, command, args);
      throw new Error('Authentication failed');
    }

    const text = await resp.text();
    if (!resp.ok) throw new CommandFailure(formatCommandError(text));

    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
  } catch (err: any) {
    if (err instanceof CommandFailure) throw err;
    if (err.name === 'AbortError') throw new Error('Command timed out');
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message?.includes('fetch failed')) {
      if (command === 'stop') {
        process.stdout.write('Server stopped\n');
        return;
      }
      if (retries >= 1) throw new Error('Server crashed twice — aborting');
      console.error('[qa-browse] Connection lost. Restarting...');
      const newState = await restartServerAfterConnectionLoss();
      if (command === 'restart') {
        process.stdout.write(`Restarted server on port ${newState.port}\n`);
        return;
      }
      return sendCommand(newState, command, args, retries + 1);
    }
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`qa-browse — Headless browser for QA testing

Usage: qa-browse <command> [args...]

Navigation:     goto <url> | back | forward | reload | url
Content:        text | html [sel] | links | forms | accessibility
Interaction:    click <sel> | fill <sel> <val> | select <sel> <val>
                hover <sel> | type <text> | press <key>
                scroll [sel] | wait <sel|--networkidle|--load> | viewport <WxH>
                upload <sel> <file1> [file2...]
                cookie-import <json-file>
Inspection:     js <expr> | eval <file> | css <sel> <prop> | attrs <sel>
                console [--clear|--errors] | network [--clear] | dialog [--clear]
                cookies | storage [set <k> <v>] | perf
                is <prop> <sel> (visible|hidden|enabled|disabled|checked|editable|focused)
Visual:         screenshot [--viewport] [--clip x,y,w,h] [@ref|sel] [path]
                pdf [path] | responsive [prefix]
Snapshot:       snapshot [-i] [-c] [-d N] [-s sel] [-D] [-a] [-o path] [-C]
Compare:        diff <url1> <url2>
Multi-step:     chain (reads JSON from stdin)
Tabs:           tabs | tab <id> | newtab [url] | closetab [id]
Server:         status | cookie <n>=<v> | header <n>:<v>
                useragent <str> | stop | restart
                handoff [message] | resume
Dialogs:        dialog-accept [text] | dialog-dismiss

Refs:           After 'snapshot', use @e1, @e2... as selectors:
                click @e3 | fill @e4 "value" | hover @e1
                @c refs from -C: click @c1`);
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (command === 'chain' && commandArgs.length === 0) {
    const stdin = await Bun.stdin.text();
    commandArgs.push(stdin.trim());
  }

  const release = await acquireLock(
    config.commandLockFile,
    COMMAND_LOCK_STALE_MS,
    COMMAND_LOCK_WAIT_MS,
    'active qa-browse command',
  );
  try {
    const state = await ensureServer();
    await sendCommand(state, command, commandArgs);
  } finally {
    release();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[qa-browse] ${err.message}`);
    process.exit(1);
  });
}
