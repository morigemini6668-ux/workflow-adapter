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
  classifyOutput,
  detectState,
  sendMessage,
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
