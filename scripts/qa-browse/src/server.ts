/**
 * qa-browse server — persistent Chromium daemon
 *
 * Architecture:
 *   Bun.serve HTTP on localhost → routes commands to Playwright
 *   Auto-shutdown after idle timeout (default 30 min)
 *   Chromium crash → server exits (CLI auto-restarts)
 */

import { BrowserManager } from './browser-manager';
import { handleReadCommand } from './read-commands';
import { handleWriteCommand } from './write-commands';
import { handleMetaCommand } from './meta-commands';
import { READ_COMMANDS, WRITE_COMMANDS, META_COMMANDS } from './commands';
import { resolveConfig, ensureStateDir } from './config';
import { consoleBuffer, networkBuffer, dialogBuffer } from './buffers';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─── Config ─────────────────────────────────────────────────────
const config = resolveConfig();
ensureStateDir(config);

// ─── Auth ───────────────────────────────────────────────────────
const AUTH_TOKEN = crypto.randomUUID();
const BROWSE_PORT = parseInt(process.env.QA_BROWSE_PORT || '0', 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.QA_BROWSE_IDLE_TIMEOUT || '1800000', 10);

function validateAuth(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${AUTH_TOKEN}`;
}

// ─── Buffer Flush ───────────────────────────────────────────────
let lastConsoleFlushed = 0;
let lastNetworkFlushed = 0;
let lastDialogFlushed = 0;
let flushInProgress = false;

async function flushBuffers() {
  if (flushInProgress) return;
  flushInProgress = true;
  try {
    const newConsole = consoleBuffer.totalAdded - lastConsoleFlushed;
    if (newConsole > 0) {
      const entries = consoleBuffer.last(Math.min(newConsole, consoleBuffer.length));
      const lines = entries.map(e => `[${new Date(e.timestamp).toISOString()}] [${e.level}] ${e.text}`).join('\n') + '\n';
      fs.appendFileSync(config.consoleLog, lines);
      lastConsoleFlushed = consoleBuffer.totalAdded;
    }
    const newNetwork = networkBuffer.totalAdded - lastNetworkFlushed;
    if (newNetwork > 0) {
      const entries = networkBuffer.last(Math.min(newNetwork, networkBuffer.length));
      const lines = entries.map(e => `[${new Date(e.timestamp).toISOString()}] ${e.method} ${e.url} → ${e.status || 'pending'} (${e.duration || '?'}ms)`).join('\n') + '\n';
      fs.appendFileSync(config.networkLog, lines);
      lastNetworkFlushed = networkBuffer.totalAdded;
    }
    const newDialog = dialogBuffer.totalAdded - lastDialogFlushed;
    if (newDialog > 0) {
      const entries = dialogBuffer.last(Math.min(newDialog, dialogBuffer.length));
      const lines = entries.map(e => `[${new Date(e.timestamp).toISOString()}] [${e.type}] "${e.message}" → ${e.action}`).join('\n') + '\n';
      fs.appendFileSync(config.dialogLog, lines);
      lastDialogFlushed = dialogBuffer.totalAdded;
    }
  } catch {} finally {
    flushInProgress = false;
  }
}

const flushInterval = setInterval(flushBuffers, 1000);

// ─── Idle Timer ────────────────────────────────────────────────
let lastActivity = Date.now();

const idleCheckInterval = setInterval(() => {
  if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    console.log(`[qa-browse] Idle for ${IDLE_TIMEOUT_MS / 1000}s, shutting down`);
    shutdown();
  }
}, 60_000);

// ─── Server ────────────────────────────────────────────────────
const browserManager = new BrowserManager();
let isShuttingDown = false;

function wrapError(err: any): string {
  const msg = err.message || String(err);
  if (err.name === 'TimeoutError' || msg.includes('Timeout') || msg.includes('timeout')) {
    if (msg.includes('locator.click') || msg.includes('locator.fill') || msg.includes('locator.hover')) {
      return `Element not found or not interactable. Run 'snapshot' for fresh refs.`;
    }
    if (msg.includes('page.goto') || msg.includes('Navigation')) {
      return `Page navigation timed out. URL may be unreachable.`;
    }
    return `Operation timed out: ${msg.split('\n')[0]}`;
  }
  if (msg.includes('resolved to') && msg.includes('elements')) {
    return `Selector matched multiple elements. Use @refs from 'snapshot'.`;
  }
  return msg;
}

async function handleCommand(body: any): Promise<Response> {
  const { command, args = [] } = body;
  if (!command) {
    return new Response(JSON.stringify({ error: 'Missing "command" field' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    let result: string;
    if (READ_COMMANDS.has(command)) result = await handleReadCommand(command, args, browserManager);
    else if (WRITE_COMMANDS.has(command)) result = await handleWriteCommand(command, args, browserManager);
    else if (META_COMMANDS.has(command)) result = await handleMetaCommand(command, args, browserManager, shutdown);
    else {
      return new Response(JSON.stringify({
        error: `Unknown command: ${command}`,
        hint: `Available: ${[...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS].sort().join(', ')}`,
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    browserManager.resetFailures();
    return new Response(result, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (err: any) {
    browserManager.incrementFailures();
    let errorMsg = wrapError(err);
    const hint = browserManager.getFailureHint();
    if (hint) errorMsg += '\n' + hint;
    return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[qa-browse] Shutting down...');
  clearInterval(flushInterval);
  clearInterval(idleCheckInterval);
  await flushBuffers();
  await browserManager.close();
  try { fs.unlinkSync(config.stateFile); } catch {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Port Discovery ─────────────────────────────────────────────
async function findPort(): Promise<number> {
  if (BROWSE_PORT) {
    try {
      const s = Bun.serve({ port: BROWSE_PORT, fetch: () => new Response('ok') });
      s.stop();
      return BROWSE_PORT;
    } catch {
      throw new Error(`Port ${BROWSE_PORT} is in use`);
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 10000 + Math.floor(Math.random() * 50000);
    try {
      const s = Bun.serve({ port, fetch: () => new Response('ok') });
      s.stop();
      return port;
    } catch { continue; }
  }
  throw new Error('No available port found');
}

// ─── Start ─────────────────────────────────────────────────────
async function start() {
  try { fs.unlinkSync(config.consoleLog); } catch {}
  try { fs.unlinkSync(config.networkLog); } catch {}
  try { fs.unlinkSync(config.dialogLog); } catch {}

  const port = await findPort();
  await browserManager.launch();

  const startTime = Date.now();
  Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch: async (req) => {
      lastActivity = Date.now();
      const url = new URL(req.url);

      if (url.pathname === '/health') {
        const healthy = await browserManager.isHealthy();
        return new Response(JSON.stringify({
          status: healthy ? 'healthy' : 'unhealthy',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          tabs: browserManager.getTabCount(),
          currentUrl: browserManager.getCurrentUrl(),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/command' && req.method === 'POST') {
        return handleCommand(await req.json());
      }

      return new Response('Not found', { status: 404 });
    },
  });

  // Write state file atomically
  const state = {
    pid: process.pid,
    port,
    token: AUTH_TOKEN,
    startedAt: new Date().toISOString(),
  };
  const tmpFile = config.stateFile + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmpFile, config.stateFile);

  console.log(`[qa-browse] Server running on http://127.0.0.1:${port} (PID: ${process.pid})`);
  console.log(`[qa-browse] State: ${config.stateFile}`);
  console.log(`[qa-browse] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
}

start().catch((err) => {
  console.error(`[qa-browse] Failed to start: ${err.message}`);
  process.exit(1);
});
