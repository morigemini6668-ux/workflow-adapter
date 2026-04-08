#!/usr/bin/env bun
/**
 * exit-codes.test.ts — Verify exit codes and MAX_WORKERS limit
 *
 * 1. Exit code 2: startDaemon with active session → "Session already active"
 * 2. Exit code 3: IPC send to non-existent agent → "Agent not found"
 * 3. Exit code 4: doctor with tmux missing → exit code 4
 * 4. MAX_WORKERS: 6th worker spawn → "Max workers exceeded"
 */

import { rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import {
  createSession,
  writeAgentState,
  OutboxReader,
  type SessionContext,
} from '../src/daemon/state.js';
import { startServer } from '../src/daemon/server.js';
import { spawnAgent } from '../src/daemon/spawn.js';
import {
  projectDir,
  EXIT_SESSION_EXISTS,
  EXIT_AGENT_NOT_FOUND,
  EXIT_TMUX_MISSING,
  MAX_WORKERS,
  socketPath,
} from '../src/lib/constants.js';

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

// ── Helpers ──────────────────────────────────────────────────────────

const PROJECT = `exit-test-${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function makeAgentState(name: string) {
  const ts = now();
  return {
    name,
    cli: 'claude' as const,
    role: 'executor',
    pane_id: `%${Math.floor(Math.random() * 1000)}`,
    pid: Math.floor(Math.random() * 10000),
    state: 'idle' as const,
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: ts,
    updated_at: ts,
  };
}

function sendIpcRequest(sockPath: string, command: string, args: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    const socket = connect(sockPath, () => {
      socket.write(JSON.stringify({
        command,
        args,
        requestId: randomUUID(),
      }) + '\n');
    });
    socket.on('data', (chunk) => {
      data += chunk.toString();
      for (const line of data.split('\n')) {
        if (!line.trim()) continue;
        try {
          resolve(JSON.parse(line));
          socket.end();
          return;
        } catch {}
      }
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('timeout')); });
  });
}

// ── Tests ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('exit-codes.test.ts — Exit Codes & MAX_WORKERS Verification');
  console.log('='.repeat(50));

  // Create a session for shared use
  const session = await createSession({
    project: PROJECT,
    cwd: '/tmp/exit-test',
    tmuxSession: `uniflow-${PROJECT}`,
    daemonPid: process.pid,
  });
  const ctx: SessionContext = { project: PROJECT, sessionId: session.id };

  // ── 1. Exit code 2: Session already exists ──────────────────────

  console.log('\n1. Exit code 2 (EXIT_SESSION_EXISTS)');

  await test('startDaemon throws "Session already active" when session exists', async () => {
    // An active session already exists from setup above.
    // Create .uniflow-id so startDaemon can resolve the project name.
    const testCwd = join(import.meta.dir, '..', '.exit-test-cwd');
    await mkdir(testCwd, { recursive: true });
    await writeFile(join(testCwd, '.uniflow-id'), PROJECT);

    const { startDaemon } = await import('../src/daemon/index.js');
    try {
      await startDaemon({
        cwd: testCwd,
        orchestratorCli: 'claude',
      });
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof Error, 'Error thrown');
      assert(err.message.includes('Session already active'), `Got: ${err.message}`);
    } finally {
      await rm(testCwd, { recursive: true, force: true });
    }
  });

  await test('EXIT_SESSION_EXISTS constant equals 2', async () => {
    assert(EXIT_SESSION_EXISTS === 2, `Expected 2, got ${EXIT_SESSION_EXISTS}`);
  });

  // ── 2. Exit code 3: Agent not found ─────────────────────────────

  console.log('\n2. Exit code 3 (EXIT_AGENT_NOT_FOUND)');

  const outboxReader = new OutboxReader(ctx);
  const server = await startServer(ctx, outboxReader);
  const sockPath = socketPath(PROJECT);

  try {
    await test('IPC send to non-existent agent returns "Agent not found"', async () => {
      const resp = await sendIpcRequest(sockPath, 'send', {
        agent: 'ghost-agent',
        message: 'hello',
        mode: 'nudge',
      });
      assert(resp.success === false, 'Should fail');
      assert(resp.error.includes('Agent not found'), `Error: ${resp.error}`);
    });

    await test('IPC assign to non-existent agent returns "Agent not found"', async () => {
      const resp = await sendIpcRequest(sockPath, 'assign', {
        agent: 'ghost-agent',
        taskId: 'task-001',
      });
      assert(resp.success === false, 'Should fail');
      assert(resp.error.includes('Agent not found'), `Error: ${resp.error}`);
    });

    await test('IPC peek non-existent agent returns "Agent not found"', async () => {
      const resp = await sendIpcRequest(sockPath, 'peek', {
        name: 'ghost-agent',
      });
      assert(resp.success === false, 'Should fail');
      assert(resp.error.includes('Agent not found'), `Error: ${resp.error}`);
    });

    await test('IPC logs non-existent agent returns "Agent not found"', async () => {
      const resp = await sendIpcRequest(sockPath, 'logs', {
        name: 'ghost-agent',
        lines: 50,
      });
      assert(resp.success === false, 'Should fail');
      assert(resp.error.includes('Agent not found'), `Error: ${resp.error}`);
    });

    await test('EXIT_AGENT_NOT_FOUND constant equals 3', async () => {
      assert(EXIT_AGENT_NOT_FOUND === 3, `Expected 3, got ${EXIT_AGENT_NOT_FOUND}`);
    });
  } finally {
    server.close();
  }

  // ── 3. Exit code 4: tmux missing ────────────────────────────────

  console.log('\n3. Exit code 4 (EXIT_TMUX_MISSING)');

  await test('doctor exits with code 4 when tmux is not in PATH', async () => {
    const { dirname } = await import('node:path');
    const uniflow = join(import.meta.dir, '..', 'src', 'index.ts');
    // Include bun's dir + /usr/bin (for `which`), but NOT tmux's dir
    const bunDir = dirname(process.execPath);
    const restrictedPath = `${bunDir}:/usr/bin`;
    const proc = Bun.spawn(['bun', 'run', uniflow, 'doctor'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PATH: restrictedPath },
    });
    const exitCode = await proc.exited;
    assert(exitCode === EXIT_TMUX_MISSING, `Expected exit code ${EXIT_TMUX_MISSING}, got ${exitCode}`);
  });

  await test('EXIT_TMUX_MISSING constant equals 4', async () => {
    assert(EXIT_TMUX_MISSING === 4, `Expected 4, got ${EXIT_TMUX_MISSING}`);
  });

  // ── 4. MAX_WORKERS enforcement ──────────────────────────────────

  console.log('\n4. MAX_WORKERS limit');

  await test(`MAX_WORKERS is ${MAX_WORKERS}`, async () => {
    assert(MAX_WORKERS === 5, `Expected 5, got ${MAX_WORKERS}`);
  });

  await test(`spawnAgent rejects ${MAX_WORKERS + 1}th worker`, async () => {
    // Write MAX_WORKERS agent state files (all workers, not orchestrator)
    for (let i = 1; i <= MAX_WORKERS; i++) {
      await writeAgentState(ctx, `worker-${i}`, makeAgentState(`worker-${i}`));
    }

    try {
      // Attempt to spawn the (MAX_WORKERS+1)th worker — should fail at validation
      // before reaching any tmux operations
      await spawnAgent(ctx, `uniflow-${PROJECT}`, {
        name: `worker-${MAX_WORKERS + 1}`,
        cli: 'claude',
        role: 'executor',
        mode: 'interactive',
        cwd: '/tmp',
      });
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof Error, 'Error thrown');
      assert(
        err.message.includes('Max workers exceeded'),
        `Expected "Max workers exceeded", got: ${err.message}`,
      );
    }
  });

  await test('orchestrator spawn bypasses MAX_WORKERS check', async () => {
    // Verify that the worker count is already at MAX_WORKERS
    const { listAgents } = await import('../src/daemon/state.js');
    const agents = await listAgents(ctx);
    const workerCount = agents.filter(a => a.role !== 'orchestrator').length;
    assert(workerCount >= MAX_WORKERS, `Expected >= ${MAX_WORKERS} workers, got ${workerCount}`);

    // spawnAgent with role='orchestrator' should NOT throw the max workers error
    // It will fail later (tmux not available, etc.) but not on the worker count check
    try {
      await spawnAgent(ctx, `uniflow-${PROJECT}`, {
        name: 'orchestrator',
        cli: 'claude',
        role: 'orchestrator',
        mode: 'interactive',
        cwd: '/tmp',
      });
    } catch (err) {
      // Should NOT be the max workers error
      assert(err instanceof Error, 'Error thrown');
      assert(
        !err.message.includes('Max workers exceeded'),
        `Orchestrator should bypass MAX_WORKERS check, but got: ${err.message}`,
      );
    }
  });

  // ── Cleanup & Summary ───────────────────────────────────────────

  await rm(projectDir(PROJECT), { recursive: true, force: true });

  console.log('\n' + '='.repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`Results: ${passed}/${total} passed, ${failed} failed (${totalTime}ms)`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\nAll tests passed!');
}

main();
