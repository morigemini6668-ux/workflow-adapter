#!/usr/bin/env bun
/**
 * E2E Live Test — Real daemon + tmux
 *
 * Scenarios:
 * 1. Happy path: start → spawn → task add → assign → status → stop
 * 2. Crash recovery: kill orchestrator pane → detect crash within 10s
 * 3. Graceful stop: stop → all panes dead + archive created
 *
 * Skips if tmux is not available.
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';

// ── Test Runner ──────────────────────────────────────────────────────

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tmux availability check ──────────────────────────────────────────

async function isTmuxAvailable(): Promise<boolean> {
  try {
    const { tmux } = await import('../src/daemon/tmux.js');
    const result = await tmux(['-V']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// ── IPC helper ───────────────────────────────────────────────────────

function ipc(sockPath: string, command: string, args: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    const socket = connect(sockPath, () => {
      socket.write(JSON.stringify({ command, args, requestId: randomUUID() }) + '\n');
    });
    socket.on('data', (chunk) => {
      data += chunk.toString();
      for (const line of data.split('\n')) {
        if (!line.trim()) continue;
        try { resolve(JSON.parse(line)); socket.end(); return; } catch {}
      }
    });
    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('IPC timeout')); });
  });
}

// ── Agent state helper ───────────────────────────────────────────────

function makeAgentState(name: string, paneId: string, role = 'executor', cli = 'claude') {
  const now = new Date().toISOString();
  return {
    name,
    cli,
    role,
    pane_id: paneId,
    pid: 0,
    state: 'idle' as const,
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: now,
    updated_at: now,
  };
}

// ── Cleanup tracker ──────────────────────────────────────────────────

const tmuxSessionsToCleanup: string[] = [];
const serversToClose: { close(): void }[] = [];
const monitorsToStop: { stop(): void }[] = [];

async function cleanup(): Promise<void> {
  for (const m of monitorsToStop) { try { m.stop(); } catch {} }
  for (const s of serversToClose) { try { s.close(); } catch {} }
  const { killSession } = await import('../src/daemon/tmux.js');
  for (const sess of tmuxSessionsToCleanup) {
    try { await killSession(sess); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Scenario 1: Happy path
// ═══════════════════════════════════════════════════════════════════════

async function scenario1_happyPath(): Promise<void> {
  console.log('\nScenario 1: Happy path (start → spawn → task → assign → status → stop)');

  const {
    createSession: createTmuxSession,
    createPane,
    killSession,
    isPaneDead,
  } = await import('../src/daemon/tmux.js');
  const {
    createSession,
    OutboxReader,
    writeAgentState,
    readTask,
    readInbox,
    readEvents,
  } = await import('../src/daemon/state.js');
  const { startServer } = await import('../src/daemon/server.js');
  const { socketPath, archiveDir } = await import('../src/lib/constants.js');

  const tag = randomUUID().slice(0, 8);
  const projectName = `e2e-happy-${tag}`;
  const tmuxName = `uniflow-e2e-happy-${tag}`;
  tmuxSessionsToCleanup.push(tmuxName);

  // 1. Create tmux session
  await createTmuxSession(tmuxName, process.cwd());

  // 2. Create session state
  const session = await createSession({
    project: projectName,
    cwd: process.cwd(),
    tmuxSession: tmuxName,
    daemonPid: process.pid,
  });
  const ctx = { project: projectName, sessionId: session.id };
  const outboxReader = new OutboxReader(ctx);

  // 3. Start IPC server with onSpawn callback that creates real tmux panes
  const onSpawn = async (args: Record<string, unknown>) => {
    const name = args.name as string;
    const paneId = await createPane(tmuxName, 'sh', process.cwd());
    await sleep(500); // Wait for shell to start
    const agent = makeAgentState(name, paneId);
    await writeAgentState(ctx, name, agent as any);
    return { name, pane_id: paneId, status: 'spawned' };
  };
  const server = await startServer(ctx, outboxReader, onSpawn);
  serversToClose.push(server);

  const sockPath = socketPath(projectName);

  // ── spawn worker via IPC
  await test('happy: spawn worker via IPC creates real tmux pane', async () => {
    const resp = await ipc(sockPath, 'spawn', { name: 'worker-1', cli: 'claude', role: 'executor' });
    assert(resp.success === true, 'spawn success');
    assert(resp.data.pane_id.startsWith('%'), `pane_id starts with %, got ${resp.data.pane_id}`);
  });

  // ── task-create via IPC
  await test('happy: task-create via IPC', async () => {
    const resp = await ipc(sockPath, 'task-create', {
      id: 'e2e-task-1',
      subject: 'Build feature',
      priority: 2,
    });
    assert(resp.success === true, 'task-create success');
    assert(resp.data.id === 'e2e-task-1', 'task id matches');
  });

  // ── assign task via IPC (real dispatch to tmux pane)
  await test('happy: assign task dispatches to real pane', async () => {
    const resp = await ipc(sockPath, 'assign', {
      agent: 'worker-1',
      taskId: 'e2e-task-1',
    });
    assert(resp.success === true, `assign success: ${resp.error ?? ''}`);
    assert(resp.data.assigned === true, 'assigned flag');

    // Verify task status changed
    const task = await readTask(ctx, 'e2e-task-1');
    assert(task.status === 'in_progress', `task status: ${task.status}`);
    assert(task.assignee === 'worker-1', `assignee: ${task.assignee}`);
  });

  // ── verify inbox was written
  await test('happy: inbox written after assign', async () => {
    const inbox = await readInbox(ctx, 'worker-1');
    assert(inbox.includes('Build feature'), 'inbox contains task subject');
  });

  // ── status via IPC
  await test('happy: status returns agents + tasks', async () => {
    const resp = await ipc(sockPath, 'status');
    assert(resp.success === true, 'status success');
    assert(resp.data.agents.length >= 1, 'has agents');
    assert(resp.data.agents.some((a: any) => a.name === 'worker-1'), 'worker-1 present');
    assert(resp.data.tasks.length >= 1, 'has tasks');
    assert(resp.data.tasks.some((t: any) => t.id === 'e2e-task-1'), 'task present');
  });

  // ── stop via IPC (kills panes + archives)
  await test('happy: stop kills panes and archives session', async () => {
    const resp = await ipc(sockPath, 'stop');
    assert(resp.success === true, 'stop success');
    assert(resp.data.stopped === true, 'stopped flag');

    // Verify archive directory was created
    const archive = archiveDir(projectName, session.id);
    assert(existsSync(archive), `archive dir exists at ${archive}`);
  });

  // ── verify events logged
  await test('happy: events.jsonl contains lifecycle events', async () => {
    // Events are in the archive now
    const archive = archiveDir(projectName, session.id);
    const eventsPath = join(archive, 'events.jsonl');
    const content = await readFile(eventsPath, 'utf-8');
    const events = content.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const types = events.map((e: any) => e.type);
    assert(types.includes('task_created'), 'has task_created event');
    assert(types.includes('task_assigned'), 'has task_assigned event');
    assert(types.includes('session_stopped'), 'has session_stopped event');
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════
// Scenario 2: Crash recovery
// ═══════════════════════════════════════════════════════════════════════

async function scenario2_crashRecovery(): Promise<void> {
  console.log('\nScenario 2: Crash recovery (kill pane → detect within 10s)');

  const {
    createSession: createTmuxSession,
    createPane,
    killPane,
    tmux,
  } = await import('../src/daemon/tmux.js');
  const {
    createSession,
    OutboxReader,
    writeAgentState,
    updateSession,
    loadSession,
    readEvents,
  } = await import('../src/daemon/state.js');
  const { startServer } = await import('../src/daemon/server.js');
  const { startMonitor } = await import('../src/daemon/monitor.js');
  const { socketPath } = await import('../src/lib/constants.js');

  const tag = randomUUID().slice(0, 8);
  const projectName = `e2e-crash-${tag}`;
  const tmuxName = `uniflow-e2e-crash-${tag}`;
  tmuxSessionsToCleanup.push(tmuxName);

  // Setup: create tmux session + daemon session
  await createTmuxSession(tmuxName, process.cwd());
  const session = await createSession({
    project: projectName,
    cwd: process.cwd(),
    tmuxSession: tmuxName,
    daemonPid: process.pid,
  });
  const ctx = { project: projectName, sessionId: session.id };
  const outboxReader = new OutboxReader(ctx);

  // Create IPC server (needed for monitor context)
  const server = await startServer(ctx, outboxReader);
  serversToClose.push(server);

  // Create an "orchestrator" pane with a simple shell
  const orchPaneId = await createPane(tmuxName, 'sh', process.cwd());
  await sleep(500);

  // Register as orchestrator
  const orchAgent = makeAgentState('orchestrator', orchPaneId, 'orchestrator');
  await writeAgentState(ctx, 'orchestrator', orchAgent as any);
  await updateSession(ctx, {
    agents: [{
      name: 'orchestrator',
      cli: 'claude' as const,
      role: 'orchestrator',
      pane_id: orchPaneId,
      pid: 0,
    }],
  });

  // Start monitor with short poll interval
  const monitor = startMonitor(ctx, outboxReader, {
    healthPollMs: 1000, // 1s for faster test
    nudgeDelayMs: 60000,
    nudgeMaxCount: 3,
  });
  monitorsToStop.push(monitor);

  await test('crash: orchestrator pane is alive before kill', async () => {
    const { isPaneDead } = await import('../src/daemon/tmux.js');
    const dead = await isPaneDead(orchPaneId);
    assert(!dead, 'orchestrator pane should be alive');
  });

  // Kill the orchestrator pane
  await test('crash: detect crash event within 10s after pane kill', async () => {
    // Force kill the pane (simulates crash)
    await tmux(['kill-pane', '-t', orchPaneId]);
    await sleep(500);

    // Wait for monitor to detect crash (max 10s)
    let crashDetected = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const events = await readEvents(ctx);
      if (events.some((e) => e.type === 'agent_crashed')) {
        crashDetected = true;
        break;
      }
    }
    assert(crashDetected, 'agent_crashed event detected within 10s');
  });

  await test('crash: event data identifies crashed orchestrator', async () => {
    const events = await readEvents(ctx);
    const crashEvent = events.find((e) => e.type === 'agent_crashed');
    assert(crashEvent !== undefined, 'crash event exists');
    assert(crashEvent!.data.agent === 'orchestrator', 'crashed agent is orchestrator');
  });

  monitor.stop();
  server.close();
}

// ═══════════════════════════════════════════════════════════════════════
// Scenario 3: Graceful stop
// ═══════════════════════════════════════════════════════════════════════

async function scenario3_gracefulStop(): Promise<void> {
  console.log('\nScenario 3: Graceful stop (stop → panes dead + archive created)');

  const {
    createSession: createTmuxSession,
    createPane,
    isPaneDead,
  } = await import('../src/daemon/tmux.js');
  const {
    createSession,
    OutboxReader,
    writeAgentState,
  } = await import('../src/daemon/state.js');
  const { startServer } = await import('../src/daemon/server.js');
  const { socketPath, archiveDir } = await import('../src/lib/constants.js');

  const tag = randomUUID().slice(0, 8);
  const projectName = `e2e-stop-${tag}`;
  const tmuxName = `uniflow-e2e-stop-${tag}`;
  tmuxSessionsToCleanup.push(tmuxName);

  // Setup
  await createTmuxSession(tmuxName, process.cwd());
  const session = await createSession({
    project: projectName,
    cwd: process.cwd(),
    tmuxSession: tmuxName,
    daemonPid: process.pid,
  });
  const ctx = { project: projectName, sessionId: session.id };
  const outboxReader = new OutboxReader(ctx);
  const server = await startServer(ctx, outboxReader);
  serversToClose.push(server);
  const sockPath = socketPath(projectName);

  // Create 2 worker panes
  const pane1 = await createPane(tmuxName, 'sh', process.cwd());
  const pane2 = await createPane(tmuxName, 'sh', process.cwd());
  await sleep(500);

  // Register agents
  await writeAgentState(ctx, 'worker-1', makeAgentState('worker-1', pane1) as any);
  await writeAgentState(ctx, 'worker-2', makeAgentState('worker-2', pane2) as any);

  await test('stop: both panes alive before stop', async () => {
    assert(!(await isPaneDead(pane1)), 'pane1 alive');
    assert(!(await isPaneDead(pane2)), 'pane2 alive');
  });

  await test('stop: IPC stop kills all agent panes', async () => {
    const resp = await ipc(sockPath, 'stop');
    assert(resp.success === true, 'stop success');
    assert(resp.data.stopped === true, 'stopped flag');

    // Wait for panes to die
    await sleep(1500);

    const dead1 = await isPaneDead(pane1);
    const dead2 = await isPaneDead(pane2);
    assert(dead1, `pane1 should be dead`);
    assert(dead2, `pane2 should be dead`);
  });

  await test('stop: archive directory created with session data', async () => {
    const archive = archiveDir(projectName, session.id);
    assert(existsSync(archive), 'archive dir exists');

    // Check archive contents
    const files = await readdir(archive);
    assert(files.includes('session.json'), 'session.json archived');
    assert(files.includes('events.jsonl'), 'events.jsonl archived');

    // Verify session status is archived
    const sessionJson = JSON.parse(await readFile(join(archive, 'session.json'), 'utf-8'));
    assert(sessionJson.status === 'archived', `session status: ${sessionJson.status}`);
  });

  await test('stop: events.jsonl contains session_stopped', async () => {
    const archive = archiveDir(projectName, session.id);
    const eventsContent = await readFile(join(archive, 'events.jsonl'), 'utf-8');
    const events = eventsContent.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    assert(events.some((e: any) => e.type === 'session_stopped'), 'has session_stopped');
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('uniflow E2E Live Tests (real daemon + tmux)');
  console.log('='.repeat(50));

  if (!(await isTmuxAvailable())) {
    console.log('\n  SKIP: tmux not available — skipping all E2E live tests');
    results.push({ name: 'tmux availability', passed: true, skipped: true, durationMs: 0 });
  } else {
    try {
      await scenario1_happyPath();
      await scenario2_crashRecovery();
      await scenario3_gracefulStop();
    } finally {
      await cleanup();
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped (${totalTime}ms)`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\nAll tests passed!');
}

main().catch(async (err) => {
  console.error('Test runner crashed:', err);
  await cleanup();
  process.exit(1);
});
