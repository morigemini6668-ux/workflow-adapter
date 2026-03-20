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
import { resolveConfig, ensureStateDir } from './config';

const config = resolveConfig();
const MAX_START_WAIT = 8000;

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

async function killServer(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) return;
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && isProcessAlive(pid)) await Bun.sleep(100);
  if (isProcessAlive(pid)) try { process.kill(pid, 'SIGKILL'); } catch {}
}

async function startServer(): Promise<ServerState> {
  ensureStateDir(config);
  try { fs.unlinkSync(config.stateFile); } catch {}

  const proc = Bun.spawn(['bun', 'run', SERVER_SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, QA_BROWSE_STATE_FILE: config.stateFile },
  });
  proc.unref();

  const start = Date.now();
  while (Date.now() - start < MAX_START_WAIT) {
    const state = readState();
    if (state && isProcessAlive(state.pid)) return state;
    await Bun.sleep(100);
  }

  const stderr = proc.stderr;
  if (stderr) {
    const reader = stderr.getReader();
    const { value } = await reader.read();
    if (value) throw new Error(`Server failed to start:\n${new TextDecoder().decode(value)}`);
  }
  throw new Error(`Server failed to start within ${MAX_START_WAIT / 1000}s`);
}

async function ensureServer(): Promise<ServerState> {
  const state = readState();
  if (state && isProcessAlive(state.pid)) {
    try {
      const resp = await fetch(`http://127.0.0.1:${state.port}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const health = await resp.json() as any;
        if (health.status === 'healthy') return state;
      }
    } catch {}
  }
  console.error('[qa-browse] Starting server...');
  return startServer();
}

async function sendCommand(state: ServerState, command: string, args: string[], retries = 0): Promise<void> {
  try {
    const resp = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ command, args }),
      signal: AbortSignal.timeout(30000),
    });

    if (resp.status === 401) {
      console.error('[qa-browse] Auth failed — retrying...');
      const newState = readState();
      if (newState && newState.token !== state.token) return sendCommand(newState, command, args);
      throw new Error('Authentication failed');
    }

    const text = await resp.text();
    if (resp.ok) {
      process.stdout.write(text);
      if (!text.endsWith('\n')) process.stdout.write('\n');
    } else {
      try {
        const err = JSON.parse(text);
        console.error(err.error || text);
        if (err.hint) console.error(err.hint);
      } catch { console.error(text); }
      process.exit(1);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') { console.error('[qa-browse] Command timed out'); process.exit(1); }
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message?.includes('fetch failed')) {
      if (retries >= 1) throw new Error('[qa-browse] Server crashed twice — aborting');
      console.error('[qa-browse] Connection lost. Restarting...');
      const newState = await startServer();
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

  const state = await ensureServer();
  await sendCommand(state, command, commandArgs);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[qa-browse] ${err.message}`);
    process.exit(1);
  });
}
