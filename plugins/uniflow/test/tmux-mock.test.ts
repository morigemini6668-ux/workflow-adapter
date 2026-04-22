#!/usr/bin/env bun
/**
 * uniflow tmux mock tests
 *
 * Tests tmux layer logic without requiring real tmux.
 * Groups:
 *   1. classifyOutput — pure function state classification
 *   2. detectState — mocked tmux pane state detection
 *   3. dispatch interrupt vs nudge — mode-specific tmux call sequences
 *   4. Codex interrupt fallback — Escape → C-u → paste → Enter×2
 *   5. sendMessage retry — text retention triggers re-submit
 *   6. waitForReady trust prompt — auto-dismiss trust/permission prompts
 */

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Test Runner ─────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    clearMock();
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  \u2713 ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, durationMs: Date.now() - start });
    console.log(`  \u2717 ${name}: ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Imports ─────────────────────────────────────────────────────────────

import {
  batchQueryPanes,
  buildReadySignalCommand,
  classifyByTitle,
  classifyOutput,
  detectState,
  effectiveState,
  registerExitHook,
  sendMessage,
  unregisterExitHook,
  waitForReady,
  _setRunner,
  type TmuxResult,
} from '../src/daemon/tmux.js';
import { dispatch } from '../src/daemon/dispatch.js';
type CliType = 'claude' | 'codex';

// ── Mock Infrastructure ─────────────────────────────────────────────────

interface TmuxCall {
  args: string[];
}

let tmuxCalls: TmuxCall[] = [];
let tmuxResponder: ((args: string[]) => { stdout: string; exitCode: number }) | null = null;
let restoreRunner: (() => void) | null = null;

function installMock(responder: (args: string[]) => { stdout: string; exitCode: number }): void {
  tmuxCalls = [];
  tmuxResponder = responder;
  restoreRunner?.();
  restoreRunner = _setRunner(async (args: string[]): Promise<TmuxResult> => {
    tmuxCalls.push({ args });
    const res = responder(args);
    return { stdout: res.stdout, stderr: '', exitCode: res.exitCode };
  });
}

function clearMock(): void {
  tmuxCalls = [];
  tmuxResponder = null;
  restoreRunner?.();
  restoreRunner = null;
}

function getCalls(): TmuxCall[] {
  return [...tmuxCalls];
}

// ── Test Fixtures ───────────────────────────────────────────────────────

const TEST_PROJECT = `test-mock-${randomUUID().slice(0, 8)}`;
const TEST_SESSION = `sess-${randomUUID().slice(0, 8)}`;
const SESSION_DIR = join(
  homedir(),
  '.uniflow',
  'projects',
  TEST_PROJECT,
  'sessions',
  TEST_SESSION,
);

const ctx = { project: TEST_PROJECT, sessionId: TEST_SESSION };

const claudeTarget = {
  name: 'worker-1',
  paneId: '%42',
  cli: 'claude' as CliType,
};

const codexTarget = {
  name: 'worker-2',
  paneId: '%43',
  cli: 'codex' as CliType,
};

/** Default mock: pane alive, capture returns clean prompt (no text retention) */
function defaultMock(captureOutput = '❯'): (args: string[]) => { stdout: string; exitCode: number } {
  return (args: string[]) => {
    if (args[0] === 'list-panes') {
      return { stdout: '0', exitCode: 0 }; // pane_dead = 0 (alive)
    }
    if (args[0] === 'capture-pane') {
      return { stdout: captureOutput, exitCode: 0 };
    }
    return { stdout: '', exitCode: 0 };
  };
}

// ── Setup / Teardown ────────────────────────────────────────────────────

async function setup(): Promise<void> {
  await mkdir(join(SESSION_DIR, 'inboxes'), { recursive: true });
  await mkdir(join(SESSION_DIR, 'agents'), { recursive: true });
  await mkdir(join(SESSION_DIR, 'tasks'), { recursive: true });
}

async function teardown(): Promise<void> {
  clearMock();
  await rm(join(homedir(), '.uniflow', 'projects', TEST_PROJECT), {
    recursive: true,
    force: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 1: classifyOutput — pure function tests
// ═══════════════════════════════════════════════════════════════════════

async function group1_classifyOutput(): Promise<void> {
  console.log('\nGroup 1: classifyOutput');

  await test('Claude idle: ❯ prompt', async () => {
    assert(classifyOutput('some output\n❯') === 'idle', 'expected idle');
  });

  await test('Claude idle: $ prompt', async () => {
    assert(classifyOutput('line1\nline2\n$ ') === 'idle', 'expected idle');
  });

  await test('Claude idle: > prompt at end', async () => {
    assert(classifyOutput('text\n> ') === 'idle', 'expected idle');
  });

  await test('Codex idle: codex> prompt', async () => {
    assert(classifyOutput('ready\ncodex> ') === 'idle', 'expected idle');
  });

  await test('Codex idle: › prompt (v0.118+)', async () => {
    assert(classifyOutput('gpt-5.4 xhigh fast\n› ') === 'idle', 'expected idle');
  });

  await test('Busy: spinner ⠋', async () => {
    assert(classifyOutput('processing\n⠋ Working...') === 'busy', 'expected busy');
  });

  await test('Busy: spinner ⠙', async () => {
    assert(classifyOutput('⠙ Loading') === 'busy', 'expected busy');
  });

  await test('Busy: spinner ⠹', async () => {
    assert(classifyOutput('⠹ Fetching') === 'busy', 'expected busy');
  });

  await test('Busy: Running keyword', async () => {
    assert(classifyOutput('Running tool call...') === 'busy', 'expected busy');
  });

  await test('Busy: Thinking keyword', async () => {
    assert(classifyOutput('Thinking about the problem') === 'busy', 'expected busy');
  });

  await test('Unknown: plain text', async () => {
    assert(
      classifyOutput('some random text\nwithout any indicators') === 'unknown',
      'expected unknown',
    );
  });

  await test('Unknown: empty string', async () => {
    assert(classifyOutput('') === 'unknown', 'expected unknown');
  });

  await test('Filters blank lines and uses last 5', async () => {
    // Many blank lines + idle indicator at the end
    const output = '\n\n\n\nline1\nline2\nline3\nline4\n❯';
    assert(classifyOutput(output) === 'idle', 'expected idle from tail');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 2: detectState — mocked tmux
// ═══════════════════════════════════════════════════════════════════════

async function group2_detectState(): Promise<void> {
  console.log('\nGroup 2: detectState');

  await test('Dead pane: list-panes fails → dead', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '', exitCode: 1 }; // Pane doesn't exist
      }
      return { stdout: '', exitCode: 0 };
    });
    const state = await detectState('%42');
    assert(state === 'dead', `expected dead, got ${state}`);
  });

  await test('Dead pane: pane_dead=1 → dead', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '1', exitCode: 0 }; // pane_dead = 1
      }
      return { stdout: '', exitCode: 0 };
    });
    const state = await detectState('%42');
    assert(state === 'dead', `expected dead, got ${state}`);
  });

  await test('Idle pane: prompt visible → idle', async () => {
    installMock(defaultMock('some output\n❯'));
    const state = await detectState('%42');
    assert(state === 'idle', `expected idle, got ${state}`);
  });

  await test('Busy pane: spinner visible → busy', async () => {
    installMock(defaultMock('⠋ Running tool call...'));
    const state = await detectState('%42');
    assert(state === 'busy', `expected busy, got ${state}`);
  });

  await test('Unknown pane: no indicators → unknown', async () => {
    installMock(defaultMock('random text with no special chars'));
    const state = await detectState('%42');
    assert(state === 'unknown', `expected unknown, got ${state}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 3: dispatch interrupt vs nudge
// ═══════════════════════════════════════════════════════════════════════

async function group3_dispatchModes(): Promise<void> {
  console.log('\nGroup 3: dispatch interrupt vs nudge');

  await test('Interrupt mode: sends C-c then message', async () => {
    installMock(defaultMock('clean prompt\n❯'));

    await dispatch(ctx, claudeTarget, 'task instructions', 'Check inbox', 'interrupt');

    const calls = getCalls();
    // Verify C-c was sent (interrupt key for claude)
    const interruptCall = calls.find(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-c'),
    );
    assert(!!interruptCall, 'expected C-c interrupt key in send-keys calls');

    // Verify message was pasted via set-buffer
    const setBufferCall = calls.find((c) => c.args[0] === 'set-buffer');
    assert(!!setBufferCall, 'expected set-buffer call for paste');

    // Verify C-c comes before set-buffer
    const ccIdx = calls.findIndex(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-c'),
    );
    const sbIdx = calls.findIndex((c) => c.args[0] === 'set-buffer');
    assert(ccIdx < sbIdx, 'C-c must come before set-buffer');
  });

  await test('Nudge mode: no interrupt key, delivers to idle agent', async () => {
    installMock(defaultMock('output\n❯')); // Idle

    await dispatch(ctx, claudeTarget, 'task instructions', 'Check inbox', 'nudge');

    const calls = getCalls();
    // Should NOT have interrupt key
    const interruptCall = calls.find(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-c'),
    );
    assert(!interruptCall, 'nudge mode should not send C-c interrupt');

    // Should have message delivery (set-buffer)
    const setBufferCall = calls.find((c) => c.args[0] === 'set-buffer');
    assert(!!setBufferCall, 'expected message delivery to idle agent');
  });

  await test('Nudge mode: skips delivery to busy agent', async () => {
    installMock(defaultMock('⠋ Running tool...')); // Busy

    await dispatch(ctx, claudeTarget, 'task instructions', 'Check inbox', 'nudge');

    const calls = getCalls();
    // Should NOT have message delivery
    const setBufferCall = calls.find((c) => c.args[0] === 'set-buffer');
    assert(!setBufferCall, 'nudge should not deliver message to busy agent');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 4: Codex interrupt fallback
// ═══════════════════════════════════════════════════════════════════════

async function group4_codexInterrupt(): Promise<void> {
  console.log('\nGroup 4: Codex interrupt fallback');

  await test('Codex interrupt sequence: Escape → C-u → paste → Enter×2', async () => {
    installMock(defaultMock('clean prompt\n> ')); // No text retention

    await dispatch(ctx, codexTarget, 'task body', 'Check inbox', 'interrupt');

    const calls = getCalls();
    const sendKeyCalls = calls.filter((c) => c.args[0] === 'send-keys');

    // 1. First send-keys must be Escape
    assert(
      sendKeyCalls[0]?.args.includes('Escape'),
      `first send-keys should be Escape, got ${JSON.stringify(sendKeyCalls[0]?.args)}`,
    );

    // 2. C-u must be present (clear line for Codex)
    const cuCall = sendKeyCalls.find((c) => c.args.includes('C-u'));
    assert(!!cuCall, 'expected C-u (clear line) for Codex');

    // 3. set-buffer + paste-buffer must be present
    const setBuffer = calls.find((c) => c.args[0] === 'set-buffer');
    const pasteBuf = calls.find((c) => c.args[0] === 'paste-buffer');
    assert(!!setBuffer, 'expected set-buffer for paste');
    assert(!!pasteBuf, 'expected paste-buffer');

    // 4. Codex needs 2 Enter presses (SUBMIT_PRESSES['codex'] = 2)
    const enterCalls = sendKeyCalls.filter((c) => c.args.includes('C-m'));
    assert(
      enterCalls.length >= 2,
      `expected ≥2 Enter presses for Codex, got ${enterCalls.length}`,
    );

    // 5. Verify order: Escape < C-u < set-buffer < paste-buffer < C-m
    const escIdx = calls.findIndex(
      (c) => c.args[0] === 'send-keys' && c.args.includes('Escape'),
    );
    const cuIdx = calls.findIndex(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-u'),
    );
    const sbIdx = calls.findIndex((c) => c.args[0] === 'set-buffer');
    const pbIdx = calls.findIndex((c) => c.args[0] === 'paste-buffer');
    const firstEnter = calls.findIndex(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );

    assert(escIdx < cuIdx, `Escape(${escIdx}) must precede C-u(${cuIdx})`);
    assert(cuIdx < sbIdx, `C-u(${cuIdx}) must precede set-buffer(${sbIdx})`);
    assert(sbIdx < pbIdx, `set-buffer(${sbIdx}) must precede paste-buffer(${pbIdx})`);
    assert(pbIdx < firstEnter, `paste-buffer(${pbIdx}) must precede Enter(${firstEnter})`);
  });

  await test('Claude interrupt does NOT send C-u', async () => {
    installMock(defaultMock('clean prompt\n❯'));

    await dispatch(ctx, claudeTarget, 'task body', 'Check inbox', 'interrupt');

    const calls = getCalls();
    const cuCall = calls.find(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-u'),
    );
    assert(!cuCall, 'Claude interrupt should not send C-u');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 5: sendMessage retry
// ═══════════════════════════════════════════════════════════════════════

async function group5_sendMessageRetry(): Promise<void> {
  console.log('\nGroup 5: sendMessage retry');

  await test('No retry when text consumed (Claude)', async () => {
    installMock((args) => {
      if (args[0] === 'capture-pane') {
        return { stdout: '❯', exitCode: 0 }; // Input area clean
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%42', 'claude', 'Hello agent, please do X');

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(enterCalls.length === 1, `expected 1 Enter (no retry), got ${enterCalls.length}`);
  });

  await test('Retry submit when text retained (Claude)', async () => {
    installMock((args) => {
      if (args[0] === 'capture-pane') {
        return { stdout: 'Hello agent, please do X\n', exitCode: 0 }; // Text still there
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%42', 'claude', 'Hello agent, please do X');

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    // 1 original + 1 retry = 2
    assert(enterCalls.length === 2, `expected 2 Enter presses (retry), got ${enterCalls.length}`);
  });

  await test('No retry when text consumed (Codex)', async () => {
    installMock((args) => {
      if (args[0] === 'capture-pane') {
        return { stdout: 'codex> ', exitCode: 0 }; // Input area clean
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%43', 'codex', 'Hello codex agent');

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    // Codex: 2 Enter presses (SUBMIT_PRESSES['codex'] = 2), no retry
    assert(enterCalls.length === 2, `expected 2 Enter (Codex, no retry), got ${enterCalls.length}`);
  });

  await test('Retry submit when text retained (Codex)', async () => {
    installMock((args) => {
      if (args[0] === 'capture-pane') {
        return { stdout: 'Hello codex agent\n> ', exitCode: 0 }; // Text still there
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%43', 'codex', 'Hello codex agent');

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    // Codex: 2 original + 2 retry = 4
    assert(enterCalls.length === 4, `expected 4 Enter (Codex retry), got ${enterCalls.length}`);
  });

  await test('Probe uses first 40 chars for long messages', async () => {
    const longMsg = 'A'.repeat(100);
    const probe = longMsg.slice(0, 40); // "AAAA...A" (40 chars)

    installMock((args) => {
      if (args[0] === 'capture-pane') {
        // Capture shows only the first 40-char probe — should still trigger retry
        return { stdout: probe, exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%42', 'claude', longMsg);

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(enterCalls.length === 2, `expected retry for long message, got ${enterCalls.length}`);
  });

  await test('No retry when capture has partial non-matching text', async () => {
    installMock((args) => {
      if (args[0] === 'capture-pane') {
        return { stdout: 'Something else entirely\n❯', exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    await sendMessage('%42', 'claude', 'Hello agent, please do X');

    const calls = getCalls();
    const enterCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(enterCalls.length === 1, `expected no retry, got ${enterCalls.length}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 6: waitForReady trust prompt auto-dismiss
// ═══════════════════════════════════════════════════════════════════════

/** Helper: create a mock where C-m dismiss flips capture from promptText to idle */
function trustPromptMock(promptText: string) {
  let dismissed = false;
  return (args: string[]) => {
    if (args[0] === 'list-panes') {
      return { stdout: '0', exitCode: 0 }; // alive
    }
    if (args[0] === 'send-keys' && args.includes('C-m')) {
      dismissed = true;
    }
    if (args[0] === 'capture-pane') {
      if (!dismissed) {
        return { stdout: promptText, exitCode: 0 };
      }
      return { stdout: '❯', exitCode: 0 }; // idle after dismiss
    }
    return { stdout: '', exitCode: 0 };
  };
}

async function group6_waitForReadyTrust(): Promise<void> {
  console.log('\nGroup 6: waitForReady trust prompt auto-dismiss');

  await test('Trust this project → C-m dismisses prompt', async () => {
    installMock(trustPromptMock('Do you want to Trust this project?\nPress enter to continue'));

    await waitForReady('%42', 5000);

    const calls = getCalls();
    const dismissCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(dismissCalls.length >= 1, 'expected C-m to dismiss trust prompt');
  });

  await test('Do you trust prompt → C-m dismisses', async () => {
    installMock(trustPromptMock('Do you trust this folder and its contents?'));

    await waitForReady('%42', 5000);

    const calls = getCalls();
    const dismissCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(dismissCalls.length >= 1, 'expected C-m for "Do you trust" pattern');
  });

  await test('bypass permissions prompt → C-m dismisses', async () => {
    installMock(trustPromptMock('Would you like to bypass permissions for this session?'));

    await waitForReady('%42', 5000);

    const calls = getCalls();
    const dismissCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(dismissCalls.length >= 1, 'expected C-m for bypass-permissions pattern');
  });

  await test('Type yes to continue prompt → C-m dismisses', async () => {
    installMock(trustPromptMock('Type yes to continue with setup'));

    await waitForReady('%42', 5000);

    const calls = getCalls();
    const dismissCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(dismissCalls.length >= 1, 'expected C-m for "Type.*to continue" pattern');
  });

  await test('press enter prompt → C-m dismisses', async () => {
    installMock(trustPromptMock('Please press enter to acknowledge the terms'));

    await waitForReady('%42', 5000);

    const calls = getCalls();
    const dismissCalls = calls.filter(
      (c) => c.args[0] === 'send-keys' && c.args.includes('C-m'),
    );
    assert(dismissCalls.length >= 1, 'expected C-m for "press enter" pattern');
  });

  await test('Trust dismiss transitions to idle (returns without error)', async () => {
    installMock(trustPromptMock('Trust this project? Press enter'));

    // waitForReady should return (not throw) once idle is detected after dismiss
    await waitForReady('%42', 5000);

    // Verify the final detectState saw idle (capture-pane returned ❯ after dismiss)
    const calls = getCalls();
    const captureAfterDismiss = calls.filter(
      (c, i) => {
        if (c.args[0] !== 'capture-pane') return false;
        // Find captures that occur after the first C-m dismiss
        const firstDismiss = calls.findIndex(
          (cc) => cc.args[0] === 'send-keys' && cc.args.includes('C-m'),
        );
        return i > firstDismiss;
      },
    );
    assert(captureAfterDismiss.length >= 1, 'expected capture-pane after trust dismiss');
  });

  await test('Dead pane during waitForReady → throws', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '', exitCode: 1 }; // dead
      }
      return { stdout: '', exitCode: 0 };
    });

    let threw = false;
    try {
      await waitForReady('%42', 2000);
    } catch (err) {
      threw = true;
      assert(
        (err as Error).message.includes('died'),
        `expected "died" in error, got: ${(err as Error).message}`,
      );
    }
    assert(threw, 'expected waitForReady to throw for dead pane');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 7: batchQueryPanes
// ═══════════════════════════════════════════════════════════════════════

async function group7_batchQueryPanes(): Promise<void> {
  console.log('\nGroup 7: batchQueryPanes');

  await test('Parses 7-field tab-separated output', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return {
          stdout: '%42\t12345\t0\t0\t2.1.104\t✳ Claude Code\t1713000000',
          exitCode: 0,
        };
      }
      return { stdout: '', exitCode: 0 };
    });

    const panes = await batchQueryPanes('test-session');
    assert(panes.length === 1, `expected 1 pane, got ${panes.length}`);
    assert(panes[0].paneId === '%42', `expected paneId %42, got ${panes[0].paneId}`);
    assert(panes[0].pid === 12345, `expected pid 12345, got ${panes[0].pid}`);
    assert(panes[0].dead === false, `expected dead=false, got ${panes[0].dead}`);
    assert(panes[0].deadStatus === 0, `expected deadStatus=0, got ${panes[0].deadStatus}`);
    assert(panes[0].currentCommand === '2.1.104', `expected cmd 2.1.104, got ${panes[0].currentCommand}`);
    assert(panes[0].paneTitle === '✳ Claude Code', `expected title '✳ Claude Code', got '${panes[0].paneTitle}'`);
    assert(panes[0].activity === 1713000000, `expected activity 1713000000, got ${panes[0].activity}`);
  });

  await test('Parses multiple panes', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        const lines = [
          '%38\t74788\t0\t0\t2.1.104\t⠐ Claude Code\t1713000001',
          '%39\t47171\t0\t0\t2.1.104\t✳ Worker Alpha\t1713000002',
          '%40\t48846\t1\t137\tcodex\tfeedback-loop\t1713000003',
        ];
        return { stdout: lines.join('\n'), exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    const panes = await batchQueryPanes('test-session');
    assert(panes.length === 3, `expected 3 panes, got ${panes.length}`);
    assert(panes[0].paneTitle === '⠐ Claude Code', 'first pane title');
    assert(panes[1].dead === false, 'second pane alive');
    assert(panes[2].dead === true, 'third pane dead');
    assert(panes[2].deadStatus === 137, `expected deadStatus 137, got ${panes[2].deadStatus}`);
  });

  await test('Empty session returns empty array', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '', exitCode: 1 }; // Session not found
      }
      return { stdout: '', exitCode: 0 };
    });

    const panes = await batchQueryPanes('nonexistent');
    assert(panes.length === 0, `expected empty array, got ${panes.length}`);
  });

  await test('Handles empty pane_activity gracefully', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        // pane_activity is empty (tmux 3.6a on macOS)
        return {
          stdout: '%42\t12345\t0\t\t2.1.104\t✳ Claude Code\t',
          exitCode: 0,
        };
      }
      return { stdout: '', exitCode: 0 };
    });

    const panes = await batchQueryPanes('test-session');
    assert(panes.length === 1, 'expected 1 pane');
    assert(panes[0].activity === 0, `expected activity=0 for empty, got ${panes[0].activity}`);
    assert(panes[0].deadStatus === 0, `expected deadStatus=0 for empty, got ${panes[0].deadStatus}`);
  });

  await test('Single tmux call per invocation', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '%42\t1\t0\t0\tclaude\ttitle\t0', exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    await batchQueryPanes('test-session');
    const calls = getCalls();
    assert(calls.length === 1, `expected 1 tmux call, got ${calls.length}`);
    assert(calls[0].args[0] === 'list-panes', 'expected list-panes call');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 8: classifyByTitle
// ═══════════════════════════════════════════════════════════════════════

async function group8_classifyByTitle(): Promise<void> {
  console.log('\nGroup 8: classifyByTitle');

  await test('Claude Code idle: ✳ prefix', async () => {
    assert(classifyByTitle('✳ Claude Code') === 'idle', 'expected idle');
  });

  await test('Claude Code idle: ✳ with custom name', async () => {
    assert(classifyByTitle('✳ Review tmux agent communication tasks') === 'idle', 'expected idle');
  });

  await test('Claude Code busy: ⠐ prefix (braille spinner)', async () => {
    assert(classifyByTitle('⠐ Claude Code') === 'busy', 'expected busy');
  });

  await test('Claude Code busy: ⠂ prefix (braille spinner)', async () => {
    assert(classifyByTitle('⠂ Implement tasks') === 'busy', 'expected busy');
  });

  await test('Claude Code busy: ⠋ prefix (braille spinner)', async () => {
    assert(classifyByTitle('⠋ Working') === 'busy', 'expected busy');
  });

  await test('Codex idle: no prefix (starts with letter)', async () => {
    assert(classifyByTitle('feedback-loop-uniflow') === 'idle', 'expected idle');
  });

  await test('Codex busy: ⠹ prefix (braille spinner)', async () => {
    assert(classifyByTitle('⠹ feedback-loop-uniflow') === 'busy', 'expected busy');
  });

  await test('Codex busy: ⠏ prefix (braille spinner)', async () => {
    assert(classifyByTitle('⠏ my-project') === 'busy', 'expected busy');
  });

  await test('Empty title: unknown', async () => {
    assert(classifyByTitle('') === 'unknown', 'expected unknown');
  });

  await test('Null-like empty: unknown', async () => {
    assert(classifyByTitle('') === 'unknown', 'expected unknown');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 8b: effectiveState
// ═══════════════════════════════════════════════════════════════════════

async function group8b_effectiveState(): Promise<void> {
  console.log('\nGroup 8b: effectiveState');

  await test('idle → idle', async () => {
    assert(effectiveState('idle') === 'idle', 'expected idle');
  });

  await test('busy → busy', async () => {
    assert(effectiveState('busy') === 'busy', 'expected busy');
  });

  await test('dead → dead', async () => {
    assert(effectiveState('dead') === 'dead', 'expected dead');
  });

  await test('unknown → busy (D1: conservative)', async () => {
    assert(effectiveState('unknown') === 'busy', 'expected busy for unknown');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 9: Hook registration (mocked tmux calls)
// ═══════════════════════════════════════════════════════════════════════

async function group9_hooks(): Promise<void> {
  console.log('\nGroup 9: Hook registration');

  await test('registerExitHook sends set-hook with spawnId-scoped channel', async () => {
    installMock(() => ({ stdout: '', exitCode: 0 }));

    await registerExitHook('worker-1', '%42', 'abc12345');

    const calls = getCalls();
    assert(calls.length === 1, `expected 1 tmux call, got ${calls.length}`);
    const args = calls[0].args;
    assert(args[0] === 'set-hook', `expected set-hook, got ${args[0]}`);
    assert(args[1] === '-t', 'expected -t flag for pane scoping');
    assert(args[2] === '%42', `expected paneId %42, got ${args[2]}`);
    assert(args[3] === 'pane-exited', `expected pane-exited hook, got ${args[3]}`);
    assert(
      args[4].includes('agent-worker-1-abc12345-exited'),
      `expected spawnId in channel name, got ${args[4]}`,
    );
    assert(args[4].includes('wait-for -S'), 'expected wait-for -S in hook command');
  });

  await test('unregisterExitHook sends set-hook -u', async () => {
    installMock(() => ({ stdout: '', exitCode: 0 }));

    await unregisterExitHook('%42');

    const calls = getCalls();
    assert(calls.length === 1, `expected 1 tmux call, got ${calls.length}`);
    const args = calls[0].args;
    assert(args[0] === 'set-hook', `expected set-hook, got ${args[0]}`);
    assert(args[1] === '-u', 'expected -u flag for unregister');
    assert(args[2] === '-t', 'expected -t flag for pane scoping');
    assert(args[3] === '%42', `expected paneId %42, got ${args[3]}`);
    assert(args[4] === 'pane-exited', `expected pane-exited hook, got ${args[4]}`);
  });

  await test('unregisterExitHook does not throw on failure', async () => {
    installMock(() => ({ stdout: '', exitCode: 1 })); // Hook doesn't exist

    // Should not throw
    await unregisterExitHook('%99');
    assert(true, 'no exception thrown');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 10: buildReadySignalCommand
// ═══════════════════════════════════════════════════════════════════════

async function group10_buildReadySignalCommand(): Promise<void> {
  console.log('\nGroup 10: buildReadySignalCommand');

  await test('Output contains agent command', async () => {
    const result = buildReadySignalCommand('claude --resume', 'agent-w1-abc-ready');
    assert(result.includes('claude --resume'), 'expected agent command in output');
  });

  await test('Output contains ready channel signal', async () => {
    const result = buildReadySignalCommand('claude', 'agent-w1-abc-ready');
    assert(
      result.includes('wait-for -S agent-w1-abc-ready'),
      `expected wait-for signal in output, got ${result}`,
    );
  });

  await test('Output starts background poller', async () => {
    const result = buildReadySignalCommand('claude', 'agent-w1-abc-ready');
    assert(result.includes('while true; do'), 'expected background loop');
    assert(result.includes('capture-pane'), 'expected capture-pane in poller');
    assert(result.includes('sleep 0.5'), 'expected 500ms poll interval');
    assert(result.includes('done &'), 'expected background execution');
  });

  await test('Poller checks for idle prompts', async () => {
    const result = buildReadySignalCommand('claude', 'agent-w1-abc-ready');
    // Should check for ❯, $, › prompts
    assert(result.includes('❯'), 'expected ❯ prompt check');
    assert(result.includes('$'), 'expected $ prompt check');
    assert(result.includes('›'), 'expected › prompt check');
  });

  await test('Agent command comes after poller', async () => {
    const result = buildReadySignalCommand('claude --resume', 'agent-w1-abc-ready');
    const pollerEnd = result.indexOf('done &');
    const agentStart = result.indexOf('claude --resume');
    assert(
      pollerEnd < agentStart,
      `expected poller (${pollerEnd}) before agent cmd (${agentStart})`,
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Group 11: waitForReady with spawnId (channel-based path)
// ═══════════════════════════════════════════════════════════════════════

async function group11_waitForReadyChannel(): Promise<void> {
  console.log('\nGroup 11: waitForReady with spawnId');

  await test('Legacy path (no spawnId): falls back to polling', async () => {
    installMock(defaultMock('❯'));

    // No name/spawnId → uses legacy polling path
    await waitForReady('%42', 5000);

    const calls = getCalls();
    // Legacy path makes capture-pane calls
    const captureCalls = calls.filter((c) => c.args[0] === 'capture-pane');
    assert(captureCalls.length >= 1, 'expected capture-pane calls in legacy path');
  });

  await test('Dead pane during legacy waitForReady → throws', async () => {
    installMock((args) => {
      if (args[0] === 'list-panes') {
        return { stdout: '', exitCode: 1 }; // dead
      }
      return { stdout: '', exitCode: 0 };
    });

    let threw = false;
    try {
      await waitForReady('%42', 2000);
    } catch (err) {
      threw = true;
      assert(
        (err as Error).message.includes('died'),
        `expected "died" in error, got: ${(err as Error).message}`,
      );
    }
    assert(threw, 'expected waitForReady to throw for dead pane');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('uniflow tmux mock tests');
  console.log('=======================');

  await setup();

  try {
    await group1_classifyOutput();
    await group2_detectState();
    await group3_dispatchModes();
    await group4_codexInterrupt();
    await group5_sendMessageRetry();
    await group6_waitForReadyTrust();
    await group7_batchQueryPanes();
    await group8_classifyByTitle();
    await group8b_effectiveState();
    await group9_hooks();
    await group10_buildReadySignalCommand();
    await group11_waitForReadyChannel();
  } finally {
    await teardown();
  }

  // Report
  console.log('\n───────────────────────────');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  \u2717 ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\nAll tests passed!');
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
