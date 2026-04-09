import {
  tmux, tmuxOk, sleep,
  createPane, killPane, isPaneDead,
  pasteText, sendKeys, capturePane,
  detectState, waitForReady,
  startPaneLog, stopPaneLog,
} from 'tmux-lib';

// ── Commands ──────────────────────────────────────────────────────────

async function cmdLaunch(args: string[]): Promise<void> {
  const cwd = args[0] || '.';
  const command = args.slice(1).join(' ');
  // Split current window (no -t target) — matches bash pane-ctl.sh behavior
  const paneId = await tmuxOk([
    'split-window', '-h', '-d',
    '-P', '-F', '#{pane_id}',
    '-c', cwd,
    command,
  ]);
  console.log(paneId);
}

async function cmdKill(args: string[]): Promise<void> {
  const paneId = args[0];
  // Graceful 3-step: C-c → C-d → force
  await tmux(['send-keys', '-t', paneId, 'C-c']).catch(() => {});
  await sleep(500);
  if (!(await isPaneDead(paneId))) {
    await tmux(['send-keys', '-t', paneId, 'C-d']).catch(() => {});
    await sleep(500);
  }
  if (!(await isPaneDead(paneId))) {
    await tmux(['kill-pane', '-t', paneId]).catch(() => {});
  }
  console.log('killed');
}

async function cmdSend(args: string[]): Promise<void> {
  const [paneId, text] = args;
  await pasteText(paneId, text);
}

async function cmdSubmit(args: string[]): Promise<void> {
  const paneId = args[0];
  await tmux(['send-keys', '-t', paneId, 'C-m']);
}

async function cmdSendSubmit(args: string[]): Promise<void> {
  const [paneId, text] = args;
  await pasteText(paneId, text);
  await sleep(150);
  await tmux(['send-keys', '-t', paneId, 'C-m']);
  // Verify delivery
  await sleep(200);
  const probe = text.slice(0, 40);
  const captured = await capturePane(paneId, 3);
  if (captured.includes(probe)) {
    await tmux(['send-keys', '-t', paneId, 'C-m']);
  }
}

async function cmdCapture(args: string[]): Promise<void> {
  const paneId = args[0];
  const lines = parseInt(args[1] || '40', 10);
  const output = await capturePane(paneId, lines);
  console.log(output);
}

async function cmdState(args: string[]): Promise<void> {
  const paneId = args[0];
  // Existence check
  const result = await tmux(['list-panes', '-t', paneId, '-F', '#{pane_id}']);
  if (result.exitCode !== 0) { console.log('dead'); return; }
  const dead = await tmux(['list-panes', '-t', paneId, '-F', '#{pane_dead}']);
  if (dead.stdout === '1') { console.log('dead'); return; }

  const state = await detectState(paneId);
  console.log(state);
}

async function cmdWaitIdle(args: string[]): Promise<void> {
  const paneId = args[0];
  const timeout = parseInt(args[1] || '1800', 10);
  const poll = parseInt(args[2] || '5', 10);
  const start = Date.now();

  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (elapsed >= timeout) {
      console.log(`STATUS:timeout:${elapsed}s`);
      process.exit(1);
    }
    const state = await detectState(paneId);
    if (state === 'idle') { console.log(`STATUS:idle:${elapsed}s`); return; }
    if (state === 'dead') { console.log(`STATUS:dead:${elapsed}s`); process.exit(1); }
    await sleep(poll * 1000);
  }
}

async function cmdWaitFile(args: string[]): Promise<void> {
  const filePath = args[0];
  const timeout = parseInt(args[1] || '1800', 10);
  const start = Date.now();

  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (elapsed >= timeout) {
      console.log(`STATUS:timeout:${filePath}`);
      process.exit(1);
    }
    if (await Bun.file(filePath).exists()) {
      console.log(`STATUS:found:${filePath}`);
      return;
    }
    await sleep(5000);
  }
}

async function cmdWaitReady(args: string[]): Promise<void> {
  const paneId = args[0];
  const timeout = parseInt(args[1] || '60', 10);
  try {
    await waitForReady(paneId, timeout * 1000, 'linear');
    console.log('STATUS:ready');
  } catch (e: any) {
    if (e.message.includes('died')) {
      console.log('STATUS:dead');
    } else {
      console.log('STATUS:timeout');
    }
    process.exit(1);
  }
}

async function cmdInterrupt(args: string[]): Promise<void> {
  const paneId = args[0];
  await tmux(['send-keys', '-t', paneId, 'C-c']);
}

async function cmdSendKeys(args: string[]): Promise<void> {
  const paneId = args[0];
  const keys = args.slice(1);
  await tmux(['send-keys', '-t', paneId, ...keys]);
}

async function cmdLogStart(args: string[]): Promise<void> {
  const [paneId, logfile] = args;
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(logfile), { recursive: true });
  await startPaneLog(paneId, logfile);
  console.log(`logging to ${logfile}`);
}

async function cmdLogStop(args: string[]): Promise<void> {
  const paneId = args[0];
  await stopPaneLog(paneId);
  console.log('logging stopped');
}

function cmdHelp(): void {
  console.log(`pane-ctl — tmux pane controller for Claude Code instances

Lifecycle:
  launch <cwd> <cmd...>           Split pane, run command, return pane_id
  kill <pane_id>                  Graceful 3-step shutdown
  wait-ready <pane_id> [timeout]  Wait for Claude Code first prompt

Text:
  send <pane_id> <text>           Paste text (no submit)
  submit <pane_id>                Press Enter
  send-submit <pane_id> <text>    Paste + submit + verify

Capture:
  capture <pane_id> [lines]       Capture pane content (default 40)
  state <pane_id>                 idle | busy | dead | unknown
  wait-idle <pane_id> [timeout] [poll]  Block until idle
  wait-file <path> [timeout]      Block until file exists

Control:
  interrupt <pane_id>             Send C-c
  send-keys <pane_id> <keys...>   Send raw tmux keys

Logging:
  log-start <pane_id> <file>      Start pipe-pane logging
  log-stop <pane_id>              Stop logging`);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'help';
  const rest = args.slice(1);

  switch (cmd) {
    case 'launch':      return cmdLaunch(rest);
    case 'kill':        return cmdKill(rest);
    case 'send':        return cmdSend(rest);
    case 'submit':      return cmdSubmit(rest);
    case 'send-submit': return cmdSendSubmit(rest);
    case 'capture':     return cmdCapture(rest);
    case 'state':       return cmdState(rest);
    case 'wait-idle':   return cmdWaitIdle(rest);
    case 'wait-file':   return cmdWaitFile(rest);
    case 'wait-ready':  return cmdWaitReady(rest);
    case 'interrupt':   return cmdInterrupt(rest);
    case 'send-keys':   return cmdSendKeys(rest);
    case 'log-start':   return cmdLogStart(rest);
    case 'log-stop':    return cmdLogStop(rest);
    case 'help': case '--help': case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command: ${cmd}`);
      cmdHelp();
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
