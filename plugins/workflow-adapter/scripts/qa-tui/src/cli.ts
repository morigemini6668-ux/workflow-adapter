import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  tmux, tmuxOk, sleep,
  capturePane, stableCapture,
  isPaneDead, forceKillPane, resizePane, displayMessage,
  sendKeys, sendLiteral,
  startPaneLog, stopPaneLog,
  createSessionWithSize,
  killSession,
} from 'tmux-lib';

// ── Config ────────────────────────────────────────────────────────────

const STATE_DIR = '.workflow-adapter/qa-tui';
const STATE_FILE = `${STATE_DIR}/state.json`;
const PREV_CAPTURE = `${STATE_DIR}/previous.txt`;
const LOG_FILE = `${STATE_DIR}/session.log`;
const SCREENSHOT_DIR = `${STATE_DIR}/screenshots`;
const DEFAULT_SESSION = `qa-tui-${process.pid}`;
const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 40;
const DEFAULT_WAIT_TIMEOUT = 10;
const POLL_INTERVAL = 300; // ms

// ── State ─────────────────────────────────────────────────────────────

interface QaTuiState {
  session: string;
  pane_id: string;
  app_command: string;
  mode: 'detached' | 'here';
  started_at: string;
}

function ensureStateDir(): void {
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function readState(): Partial<QaTuiState> {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
}

function saveState(session: string, paneId: string, appCommand: string, mode: 'detached' | 'here'): void {
  const state: QaTuiState = {
    session, pane_id: paneId, app_command: appCommand, mode,
    started_at: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

function getPane(): string {
  const state = readState();
  return state.pane_id ?? '';
}

function getSession(): string {
  const state = readState();
  return state.session ?? '';
}

function getMode(): string {
  const state = readState();
  return state.mode ?? 'detached';
}

function requirePane(): string {
  const pane = getPane();
  if (!pane) die("No active pane. Use 'attach' or 'launch' first.");
  return pane;
}

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// ── Commands ──────────────────────────────────────────────────────────

async function cmdAttach(args: string[]): Promise<void> {
  const paneId = args[0];
  if (!paneId) die('Usage: qa-tui attach <pane-id>');
  ensureStateDir();

  const result = await tmux(['list-panes', '-t', paneId]);
  if (result.exitCode !== 0) {
    die(`Pane '${paneId}' not found. List panes with: tmux list-panes -a -F '#{pane_id} #{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'`);
  }

  const session = await tmuxOk(['display-message', '-p', '-t', paneId, '#{session_name}']);
  const cmd = await tmuxOk(['display-message', '-p', '-t', paneId, '#{pane_current_command}']);
  saveState(session, paneId, cmd, 'here');
  console.log(`Attached to pane ${paneId} (session: ${session}, running: ${cmd})`);
}

async function cmdLaunch(args: string[]): Promise<void> {
  ensureStateDir();

  let appCmd = '';
  let sessionName = DEFAULT_SESSION;
  let width = DEFAULT_WIDTH;
  let height = DEFAULT_HEIGHT;
  let here = false;
  let split = 'v';
  let percent = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--here': here = true; break;
      case '--split': split = args[++i]; break;
      case '--percent': percent = args[++i]; break;
      case '--session': sessionName = args[++i]; break;
      case '--size': {
        const parts = args[++i].split('x');
        width = parseInt(parts[0], 10);
        height = parseInt(parts[1], 10);
        break;
      }
      default:
        appCmd = appCmd ? `${appCmd} ${args[i]}` : args[i];
    }
  }

  if (!appCmd) die("Usage: qa-tui launch <command> [--here [--split h|v] [--percent N]] [--session name] [--size WxH]");

  if (here) {
    if (!process.env.TMUX) die('Not inside a tmux session. Remove --here to create a new detached session.');

    const splitFlag = (split === 'h' || split === 'horizontal') ? '-h' : '-v';
    const splitArgs = [splitFlag];
    if (percent) splitArgs.push('-l', `${percent}%`);

    // Kill existing managed pane if in here mode
    const existingMode = getMode();
    const existingPane = getPane();
    if (existingMode === 'here' && existingPane) {
      await tmux(['kill-pane', '-t', existingPane]).catch(() => {});
    }

    const paneId = await tmuxOk(['split-window', ...splitArgs, '-PF', '#{pane_id}', appCmd]);
    sessionName = await tmuxOk(['display-message', '-p', '#{session_name}']);

    saveState(sessionName, paneId, appCmd, 'here');
    await sleep(500);
    console.log(`Launched '${appCmd}' in current session (pane: ${paneId}, split: ${split}${percent ? `, ${percent}%` : ''})`);
  } else {
    // Kill existing session with same name
    const existingSession = getSession();
    if (existingSession === sessionName) {
      await killSession(sessionName).catch(() => {});
    }

    const paneId = await createSessionWithSize(sessionName, process.cwd(), width, height, appCmd);
    saveState(sessionName, paneId, appCmd, 'detached');
    await sleep(500);
    console.log(`Launched '${appCmd}' in session '${sessionName}' (pane: ${paneId}, size: ${width}x${height})`);
  }
}

async function cmdCapture(args: string[]): Promise<void> {
  const pane = requirePane();
  let ansi = false, history = false, raw = false, stable = false;
  let delay = 0, historyLines: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ansi': ansi = true; break;
      case '--history': history = true; break;
      case '--raw': raw = true; break;
      case '--stable': stable = true; break;
      case '--delay': delay = parseFloat(args[++i]) * 1000; break;
      case '-n': historyLines = parseInt(args[++i], 10); break;
    }
  }

  if (delay > 0) await sleep(delay);

  let output: string;
  if (stable) {
    const result = await stableCapture(pane, { raw, ansi, history, historyLines: historyLines ?? (history ? undefined : undefined) });
    if (!result.stabilized) {
      console.error(`WARN: capture did not stabilize after ${result.attempts} attempts`);
    }
    output = result.output;
  } else {
    output = await capturePane(pane, { raw, ansi, history, historyLines });
  }

  // Save for diff (only plain text)
  if (!ansi) {
    if (existsSync(PREV_CAPTURE)) {
      try { copyFileSync(PREV_CAPTURE, `${PREV_CAPTURE}.old`); } catch {}
    }
    writeFileSync(PREV_CAPTURE, output + '\n');
  }

  console.log(output);
}

async function cmdScreenshot(args: string[]): Promise<void> {
  const outputPath = args[0];
  if (!outputPath) die('Usage: qa-tui screenshot <path>');
  const pane = requirePane();

  const tool = Bun.which('freeze') ? 'freeze' : Bun.which('aha') ? 'aha' : 'none';

  // Capture ANSI content
  const ansiContent = await capturePane(pane, { ansi: true });

  mkdirSync(dirname(outputPath), { recursive: true });

  switch (tool) {
    case 'freeze': {
      const proc = Bun.spawn(['freeze', '--language', 'bash', '-o', outputPath], {
        stdin: new Blob([ansiContent]),
      });
      await proc.exited;
      console.log(`Screenshot saved (PNG via freeze): ${outputPath}`);
      break;
    }
    case 'aha': {
      const htmlPath = outputPath.replace(/\.[^.]+$/, '.html');
      const proc = Bun.spawn(['aha', '--no-header'], { stdin: new Blob([ansiContent]) });
      const html = await new Response(proc.stdout).text();
      await proc.exited;
      writeFileSync(htmlPath, html);
      console.log(`Screenshot saved (HTML via aha): ${htmlPath}`);
      break;
    }
    case 'none': {
      const txtPath = outputPath.replace(/\.[^.]+$/, '.txt');
      const plainContent = await capturePane(pane);
      writeFileSync(txtPath, plainContent);
      console.log(`Screenshot saved (plain text fallback): ${txtPath}`);
      console.log('TIP: Install freeze for PNG screenshots: brew install charmbracelet/tap/freeze');
      break;
    }
  }
}

async function cmdSend(args: string[]): Promise<void> {
  const pane = requirePane();
  if (args.length === 0) die('Usage: qa-tui send <keys...>');
  await sendKeys(pane, ...args);
  await sleep(100);
  console.log(`Sent keys: ${args.join(' ')}`);
}

async function cmdType(args: string[]): Promise<void> {
  const pane = requirePane();
  if (args.length === 0) die('Usage: qa-tui type <text>');
  const text = args.join(' ');
  await sendLiteral(pane, text);
  await sleep(100);
  console.log(`Typed: ${text}`);
}

async function cmdPress(args: string[]): Promise<void> {
  const pane = requirePane();
  if (args.length === 0) die('Usage: qa-tui press <key>');
  await sendKeys(pane, args[0]);
  await sleep(100);
  console.log(`Pressed: ${args[0]}`);
}

async function cmdSearch(args: string[]): Promise<void> {
  const pattern = args[0];
  if (!pattern) die('Usage: qa-tui search <pattern>');
  const pane = requirePane();
  const content = await capturePane(pane);
  const lines = content.split('\n');
  const matches = lines
    .map((line, i) => ({ line, num: i + 1 }))
    .filter(({ line }) => line.includes(pattern));

  if (matches.length > 0) {
    console.log('Found matches:');
    matches.forEach(({ line, num }) => console.log(`${num}:${line}`));
  } else {
    console.log(`No matches for pattern: ${pattern}`);
  }
}

async function cmdWait(args: string[]): Promise<void> {
  let pattern = '';
  let timeout = DEFAULT_WAIT_TIMEOUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--timeout') { timeout = parseFloat(args[++i]); }
    else { pattern = args[i]; }
  }
  if (!pattern) die('Usage: qa-tui wait <pattern> [--timeout N]');

  const pane = requirePane();
  const start = Date.now();
  const timeoutMs = timeout * 1000;

  while (Date.now() - start < timeoutMs) {
    const content = await capturePane(pane);
    if (content.includes(pattern)) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Found '${pattern}' after ${elapsed}s`);
      return;
    }
    await sleep(POLL_INTERVAL);
  }

  console.log(`Timeout: '${pattern}' not found after ${timeout}s`);
  process.exit(1);
}

async function cmdDiff(_args: string[]): Promise<void> {
  const pane = requirePane();
  if (!existsSync(PREV_CAPTURE)) die("No previous capture to diff against. Run 'capture' first.");

  const current = await capturePane(pane);
  const prevContent = readFileSync(PREV_CAPTURE, 'utf-8');
  writeFileSync(PREV_CAPTURE, current + '\n');

  // Use external diff for format compatibility
  const prevTmp = `/tmp/qa-tui-diff-prev-${process.pid}`;
  const curTmp = `/tmp/qa-tui-diff-cur-${process.pid}`;
  writeFileSync(prevTmp, prevContent);
  writeFileSync(curTmp, current + '\n');

  const proc = Bun.spawn(['diff', '--unified', prevTmp, curTmp], { stdout: 'inherit', stderr: 'inherit' });
  await proc.exited;
  unlinkSync(prevTmp);
  unlinkSync(curTmp);
}

async function cmdSize(_args: string[]): Promise<void> {
  const pane = requirePane();
  const width = await displayMessage(pane, '#{pane_width}');
  const height = await displayMessage(pane, '#{pane_height}');
  console.log(`${width}x${height}`);
}

async function cmdResize(args: string[]): Promise<void> {
  const spec = args[0];
  if (!spec) die('Usage: qa-tui resize <WxH>');
  const pane = requirePane();
  const [w, h] = spec.split('x').map(Number);
  await resizePane(pane, w, h);
  console.log(`Resized to ${w}x${h}`);
}

async function cmdStatus(_args: string[]): Promise<void> {
  const pane = getPane();
  const session = getSession();

  if (!pane) {
    console.log('{"attached": false, "message": "No active pane. Use attach or launch first."}');
    process.exit(1);
  }

  if (!(await isPaneDead(pane))) {
    const width = await displayMessage(pane, '#{pane_width}').catch(() => '?');
    const height = await displayMessage(pane, '#{pane_height}').catch(() => '?');
    const cmd = await displayMessage(pane, '#{pane_current_command}').catch(() => '?');
    const pid = await displayMessage(pane, '#{pane_pid}').catch(() => '?');
    console.log(`Pane: ${pane} (session: ${session})`);
    console.log('Status: alive');
    console.log(`Size: ${width}x${height}`);
    console.log(`Command: ${cmd} (PID: ${pid})`);
  } else {
    console.log(`Pane: ${pane} (session: ${session})`);
    console.log('Status: dead');
    process.exit(1);
  }
}

async function cmdStop(_args: string[]): Promise<void> {
  const mode = getMode();
  const pane = getPane();
  const session = getSession();

  if (!pane && !session) die('No active session to stop.');

  if (mode === 'here') {
    await tmux(['kill-pane', '-t', pane]).catch(() => {});
    console.log(`Pane '${pane}' closed and state cleared.`);
  } else {
    await killSession(session).catch(() => {});
    console.log(`Session '${session}' stopped and state cleared.`);
  }
  try { unlinkSync(STATE_FILE); } catch {}
}

async function cmdLog(args: string[]): Promise<void> {
  const pane = requirePane();
  const subcmd = args[0];
  if (!subcmd) die('Usage: qa-tui log --start|--stop|--read [--errors]');

  switch (subcmd) {
    case '--start':
      await startPaneLog(pane, LOG_FILE);
      console.log(`Logging started → ${LOG_FILE}`);
      break;
    case '--stop':
      await stopPaneLog(pane);
      console.log('Logging stopped.');
      break;
    case '--read':
      if (!existsSync(LOG_FILE)) {
        console.log('No log file. Start logging with: qa-tui log --start');
        process.exit(1);
      }
      const content = readFileSync(LOG_FILE, 'utf-8');
      if (args[1] === '--errors') {
        const errors = content.split('\n').filter(l =>
          /error|err|fail|fatal|panic|exception|traceback|segfault/i.test(l)
        );
        console.log(errors.length > 0 ? errors.join('\n') : 'No errors found in log.');
      } else {
        console.log(content);
      }
      break;
    default:
      die('Usage: qa-tui log --start|--stop|--read [--errors]');
  }
}

function cmdHelp(): void {
  console.log(`qa-tui — tmux-based TUI interaction CLI

Commands:
  attach <pane-id>                Connect to an existing tmux pane
  launch <cmd> [options]          Launch app in tmux
    --here                        Split current pane
    --split h|v                   Split direction (default: v)
    --percent N                   Split size as percentage
    --session S                   Session name (detached mode)
    --size WxH                    Terminal size (detached mode)
  capture [options]               Capture pane content
    --stable                      Retry until output stabilizes
    --raw                         Preserve exact TUI layout
    --ansi                        Include ANSI escape sequences
    --history [-n N]              Capture scrollback history
    --delay N                     Wait N seconds before capture
  screenshot <path>               Capture pane as image
  send <keys...>                  Send named keys
  type <text>                     Send literal text
  press <key>                     Send single key
  search <pattern>                Search screen for text
  wait <pattern> [--timeout N]    Wait for text to appear
  diff                            Diff against previous capture
  size                            Print pane dimensions
  resize <WxH>                    Resize pane
  status                          Check pane health
  stop                            Kill managed session
  log --start|--stop|--read       Manage logging`);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!Bun.which('tmux')) die('tmux is not installed');

  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'help';
  const rest = args.slice(1);

  switch (cmd) {
    case 'attach':     return cmdAttach(rest);
    case 'launch':     return cmdLaunch(rest);
    case 'capture':    return cmdCapture(rest);
    case 'screenshot': return cmdScreenshot(rest);
    case 'send':       return cmdSend(rest);
    case 'type':       return cmdType(rest);
    case 'press':      return cmdPress(rest);
    case 'search':     return cmdSearch(rest);
    case 'wait':       return cmdWait(rest);
    case 'diff':       return cmdDiff(rest);
    case 'size':       return cmdSize(rest);
    case 'resize':     return cmdResize(rest);
    case 'status':     return cmdStatus(rest);
    case 'stop':       return cmdStop(rest);
    case 'log':        return cmdLog(rest);
    case 'help': case '--help': case '-h':
      return cmdHelp();
    default:
      die(`Unknown command: ${cmd}. Run 'qa-tui help' for usage.`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });
}
