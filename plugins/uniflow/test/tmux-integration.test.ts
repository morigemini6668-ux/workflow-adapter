#!/usr/bin/env bun
/**
 * uniflow tmux integration tests
 *
 * Tests real tmux pane lifecycle: create → capture → detect → send → kill.
 * Automatically skips if tmux is not available.
 */

import {
  tmux,
  createSession,
  killSession,
  createPane,
  capturePane,
  detectState,
  sendMessage,
  killPane,
  isPaneDead,
} from '../src/daemon/tmux.js';

// ── Test Runner ─────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Skip Check ──────────────────────────────────────────────────────────

async function isTmuxAvailable(): Promise<boolean> {
  try {
    const result = await tmux(['-V']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// ── Test Session ────────────────────────────────────────────────────────

const SESSION = `uniflow-integ-${crypto.randomUUID().slice(0, 8)}`;
const CWD = process.cwd();

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

async function runTests(): Promise<void> {
  // Setup: create a detached tmux session
  await createSession(SESSION, CWD);
  console.log(`  (session: ${SESSION})`);

  let paneId = '';

  try {
    // ── 1. createPane ─────────────────────────────────────────────────
    await test('createPane() → pane_id starts with %', async () => {
      paneId = await createPane(SESSION, 'sh', CWD);
      assert(paneId.startsWith('%'), `expected pane_id starting with %, got "${paneId}"`);
    });

    // Wait for shell to initialize
    await sleep(1000);

    // ── 2. capturePane ────────────────────────────────────────────────
    await test('capturePane() → non-empty string', async () => {
      assert(paneId !== '', 'pane not created');
      const output = await capturePane(paneId);
      assert(typeof output === 'string', `expected string, got ${typeof output}`);
      assert(output.length > 0, 'expected non-empty capture output');
    });

    // ── 3. detectState ────────────────────────────────────────────────
    await test('detectState() → one of idle/busy/dead', async () => {
      assert(paneId !== '', 'pane not created');
      const state = await detectState(paneId);
      assert(
        ['idle', 'busy', 'dead', 'unknown'].includes(state),
        `expected valid PaneState, got "${state}"`,
      );
    });

    // ── 4. sendMessage ────────────────────────────────────────────────
    await test('sendMessage() → paste-buffer + submit works', async () => {
      assert(paneId !== '', 'pane not created');
      const marker = `UNIFLOW_TEST_${Date.now()}`;
      // Send echo command; shell will output the marker
      await sendMessage(paneId, 'claude', `echo ${marker}`);
      await sleep(1000); // Wait for shell to process
      const output = await capturePane(paneId, 30);
      assert(
        output.includes(marker),
        `expected marker "${marker}" in capture, last 300 chars: "${output.slice(-300)}"`,
      );
    });

    // ── 5. killPane ───────────────────────────────────────────────────
    await test('killPane() → isPaneDead() returns true', async () => {
      assert(paneId !== '', 'pane not created');
      await killPane(paneId);
      await sleep(500);
      const dead = await isPaneDead(paneId);
      assert(dead, 'expected pane to be dead after killPane');
    });
  } finally {
    // Teardown: always kill the test session
    try {
      await killSession(SESSION);
    } catch {
      // Session might already be gone if all panes killed
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('uniflow tmux integration tests');
  console.log('==============================');

  if (!(await isTmuxAvailable())) {
    console.log('\n  SKIP: tmux not available — skipping all integration tests');
    results.push({
      name: 'tmux availability',
      passed: true,
      skipped: true,
      durationMs: 0,
    });
  } else {
    console.log('\nRunning integration tests (real tmux)');
    await runTests();
  }

  // Report
  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${results.length} total`,
  );

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
  // Emergency cleanup
  killSession(SESSION).catch(() => {});
  process.exit(1);
});
