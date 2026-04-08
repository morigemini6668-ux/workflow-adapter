#!/usr/bin/env bun
/**
 * uniflow CLI QA — Edge Cases & Error Paths
 *
 * Tests:
 * 1. Invalid input handling (bad args, missing args, empty strings)
 * 2. Error messages and exit codes (spec §5.5)
 * 3. Daemon not running scenarios
 * 4. Command-specific edge cases
 * 5. Signal handling
 */

import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// ── Test Runner ──────────────────────────────────────────────────────

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
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, durationMs: Date.now() - start });
    console.log(`  ✗ ${name}: ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const UNIFLOW = join(import.meta.dir, '..', 'src', 'index.ts');

async function run(args: string[], options?: { cwd?: string }): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(['bun', 'run', UNIFLOW, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: options?.cwd,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

// ── 1: Exit Codes ────────────────────────────────────────────────────

async function exitCodeTests(): Promise<void> {
  console.log('\n1. Exit Code Tests (spec §5.5)');

  await test('--help exits with code 0', async () => {
    const { exitCode } = await run(['--help']);
    assert(exitCode === 0, `Expected 0, got ${exitCode}`);
  });

  await test('--version exits with code 0', async () => {
    const { exitCode } = await run(['--version']);
    assert(exitCode === 0, `Expected 0, got ${exitCode}`);
  });

  await test('unknown command exits with code 1', async () => {
    const { exitCode, stderr } = await run(['nonexistent']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Unknown command'), 'Error mentions unknown command');
  });

  await test('command --help exits with code 0', async () => {
    const { exitCode, stdout } = await run(['spawn', '--help']);
    assert(exitCode === 0, `Expected 0, got ${exitCode}`);
    assert(stdout.includes('Spawn'), 'Shows command description');
  });
}

// ── 2: Invalid Input Handling ────────────────────────────────────────

async function invalidInputTests(): Promise<void> {
  console.log('\n2. Invalid Input Handling');

  await test('spawn without name shows usage and exits 1', async () => {
    const { exitCode, stderr } = await run(['spawn']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Usage'), 'Shows usage message');
  });

  await test('send without agent shows usage and exits 1', async () => {
    const { exitCode, stderr } = await run(['send']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Usage'), 'Shows usage message');
  });

  await test('assign without args shows usage and exits 1', async () => {
    const { exitCode, stderr } = await run(['assign']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Usage'), 'Shows usage message');
  });

  await test('task-add without subject shows usage and exits 1', async () => {
    const { exitCode, stderr } = await run(['task-add']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Usage'), 'Shows usage message');
  });

  await test('logs without agent shows usage and exits 1', async () => {
    const { exitCode, stderr } = await run(['logs']);
    assert(exitCode === 1, `Expected 1, got ${exitCode}`);
    assert(stderr.includes('Usage'), 'Shows usage message');
  });
}

// ── 3: Daemon Not Running ────────────────────────────────────────────

async function daemonNotRunningTests(): Promise<void> {
  console.log('\n3. Daemon Not Running (should fail gracefully)');

  // Create a temp dir with .uniflow-id but no daemon
  const tempDir = await mkdtemp(join(tmpdir(), 'uniflow-qa-'));
  await writeFile(join(tempDir, '.uniflow-id'), 'test-project-qa');
  // Initialize git repo so findProjectRoot works
  const gitInit = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
  await gitInit.exited;

  try {
    await test('status without daemon shows error (not crash)', async () => {
      const { exitCode, stderr } = await run(['status'], { cwd: tempDir });
      assert(exitCode !== 0, 'Non-zero exit');
      assert(
        stderr.includes('not running') || stderr.includes('Error') || stderr.includes('ENOENT'),
        'Shows helpful error',
      );
    });

    await test('stop without daemon shows error (not crash)', async () => {
      const { exitCode, stderr } = await run(['stop'], { cwd: tempDir });
      assert(exitCode !== 0, 'Non-zero exit');
      // Should not crash with unhandled exception
    });

    await test('spawn without daemon shows error (not crash)', async () => {
      const { exitCode } = await run(['spawn', 'worker-1'], { cwd: tempDir });
      assert(exitCode !== 0, 'Non-zero exit');
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── 4: Doctor Edge Cases ─────────────────────────────────────────────

async function doctorTests(): Promise<void> {
  console.log('\n4. Doctor Edge Cases');

  await test('doctor output includes tmux check', async () => {
    const { stdout } = await run(['doctor']);
    assert(
      stdout.toLowerCase().includes('tmux'),
      'Doctor output mentions tmux',
    );
  });

  await test('doctor output includes cli checks', async () => {
    const { stdout } = await run(['doctor']);
    assert(
      stdout.toLowerCase().includes('claude') || stdout.toLowerCase().includes('codex'),
      'Doctor output mentions CLI tools',
    );
  });
}

// ── 5: Init Edge Cases ──────────────────────────────────────────────

async function initTests(): Promise<void> {
  console.log('\n5. Init Edge Cases');

  const tempDir = await mkdtemp(join(tmpdir(), 'uniflow-init-'));
  const gitInit = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
  await gitInit.exited;

  try {
    await test('init creates .uniflow-id in new project', async () => {
      const { exitCode, stdout } = await run(['init'], { cwd: tempDir });
      assert(exitCode === 0, `Expected 0, got ${exitCode}`);
      const idFile = Bun.file(join(tempDir, '.uniflow-id'));
      assert(await idFile.exists(), '.uniflow-id created');
      const content = (await idFile.text()).trim();
      assert(content.length > 0, 'ID file not empty');
      assert(content.includes('-'), 'ID has two-word format (contains dash)');
    });

    await test('init is idempotent — second run preserves existing ID', async () => {
      const idBefore = (await Bun.file(join(tempDir, '.uniflow-id')).text()).trim();
      const { exitCode } = await run(['init'], { cwd: tempDir });
      assert(exitCode === 0, `Expected 0, got ${exitCode}`);
      const idAfter = (await Bun.file(join(tempDir, '.uniflow-id')).text()).trim();
      assert(idBefore === idAfter, `ID changed: ${idBefore} → ${idAfter}`);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── 6: Help System ───────────────────────────────────────────────────

async function helpSystemTests(): Promise<void> {
  console.log('\n6. Help System (every command has --help)');

  const commands = [
    'init', 'doctor', 'install', 'start', 'stop', 'status',
    'spawn', 'send', 'assign', 'task-add', 'agents', 'tasks',
    'logs', 'peek', 'nudge', 'respawn', 'attach', 'worktree', 'tui',
  ];

  for (const cmd of commands) {
    await test(`${cmd} --help exits 0`, async () => {
      const { exitCode } = await run([cmd, '--help']);
      assert(exitCode === 0, `Expected 0, got ${exitCode}`);
    });
  }
}

// ── Run All ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('uniflow CLI QA — Edge Cases & Error Paths');
  console.log('='.repeat(50));

  await exitCodeTests();
  await invalidInputTests();
  await daemonNotRunningTests();
  await doctorTests();
  await initTests();
  await helpSystemTests();

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`Results: ${passed}/${total} passed, ${failed} failed (${totalTime}ms)`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
  }

  // Write QA report
  const reportPath = join(import.meta.dir, '..', '.workflow-adapter', 'tmux-agent-orchestration', 'cli-qa-report.md');
  const report = [
    '# CLI QA Report',
    '',
    `Date: ${new Date().toISOString()}`,
    `Results: ${passed}/${total} passed, ${failed} failed`,
    `Duration: ${totalTime}ms`,
    '',
    '## Test Results',
    '',
    ...results.map(r => `- [${r.passed ? 'x' : ' '}] ${r.name}${r.error ? ` — ${r.error}` : ''} (${r.durationMs}ms)`),
  ].join('\n');
  await mkdir(join(import.meta.dir, '..', '.workflow-adapter', 'tmux-agent-orchestration'), { recursive: true });
  await writeFile(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);

  if (failed > 0) process.exit(1);
  console.log('\nAll CLI QA tests passed!');
}

main();
