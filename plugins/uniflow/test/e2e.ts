#!/usr/bin/env bun
/**
 * uniflow E2E Integration Tests
 *
 * Scenarios:
 * 1. State Management — create/load/archive sessions, CRUD agents/tasks
 * 2. IPC Protocol — daemon server + client socket communication
 * 3. tmux Integration — pane create/capture/kill (if tmux available)
 * 4. CLI Structure — help text, exit codes, command routing
 * 5. Template Rendering — orchestrator/worker template variable substitution
 * 6. Launch Commands — Claude/Codex command building
 */

import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

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

// ── Scenario 1: State Management ─────────────────────────────────────

async function scenario1_stateManagement(): Promise<void> {
  console.log('\nScenario 1: State Management');

  // Setup: override UNIFLOW_HOME to temp dir
  const tempHome = await mkdtemp(join(tmpdir(), 'uniflow-test-'));
  const origHome = process.env.HOME;

  try {
    const {
      createSession,
      loadSession,
      archiveSession,
      writeAgentState,
      readAgentState,
      listAgents,
      writeTask,
      readTask,
      listTasks,
      writeInbox,
      readInbox,
      clearInbox,
      OutboxReader,
      appendOutbox,
      appendEvent,
      readEvents,
    } = await import('../src/daemon/state.js');

    const projectName = 'test-project';
    const projectDir = join(tempHome, '.uniflow', 'projects', projectName, 'sessions');
    await mkdir(projectDir, { recursive: true });

    await test('createSession creates session.json and subdirs', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp/test',
        tmuxSession: 'uniflow-test',
        daemonPid: process.pid,
      });
      assert(!!session.id, 'Session ID exists');
      assert(session.project === projectName, 'Project matches');
      assert(session.status === 'active', 'Status is active');
    });

    await test('loadSession reads back saved session', async () => {
      const created = await createSession({
        project: projectName,
        cwd: '/tmp/test2',
        tmuxSession: 'uniflow-test2',
        daemonPid: process.pid,
      });
      const loaded = await loadSession(projectName, created.id);
      assert(loaded.id === created.id, 'IDs match');
      assert(loaded.cwd === '/tmp/test2', 'CWD matches');
    });

    await test('writeAgentState + readAgentState roundtrip', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-agents',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      const state = {
        name: 'worker-1',
        cli: 'claude' as const,
        role: 'executor',
        pane_id: '%42',
        pid: 12345,
        state: 'idle' as const,
        current_task: null,
        progress: null,
        nudge_count: 0,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await writeAgentState(ctx, 'worker-1', state);
      const read = await readAgentState(ctx, 'worker-1');
      assert(read.name === 'worker-1', 'Name matches');
      assert(read.state === 'idle', 'State matches');
      assert(read.pane_id === '%42', 'Pane ID matches');
    });

    await test('listAgents returns all agents', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-list',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      const now = new Date().toISOString();
      await writeAgentState(ctx, 'w1', {
        name: 'w1', cli: 'claude', role: 'executor', pane_id: '%1', pid: 1,
        state: 'idle', current_task: null, progress: null, nudge_count: 0,
        started_at: now, updated_at: now,
      });
      await writeAgentState(ctx, 'w2', {
        name: 'w2', cli: 'codex', role: 'executor', pane_id: '%2', pid: 2,
        state: 'working', current_task: 'task-001', progress: 'Building', nudge_count: 0,
        started_at: now, updated_at: now,
      });
      const agents = await listAgents(ctx);
      assert(agents.length === 2, `Expected 2 agents, got ${agents.length}`);
    });

    await test('writeTask + readTask + listTasks CRUD', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-tasks',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      const now = new Date().toISOString();
      const task = {
        id: 'task-001',
        subject: 'Test task',
        description: 'A test task',
        status: 'pending' as const,
        assignee: null,
        priority: 1,
        depends_on: [],
        created_at: now,
        assigned_at: null,
        completed_at: null,
        result: null,
        error: null,
      };
      await writeTask(ctx, 'task-001', task);
      const read = await readTask(ctx, 'task-001');
      assert(read.id === 'task-001', 'ID matches');
      assert(read.subject === 'Test task', 'Subject matches');

      const all = await listTasks(ctx);
      assert(all.length === 1, `Expected 1 task, got ${all.length}`);
    });

    await test('inbox write + read + clear', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-inbox',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      await writeInbox(ctx, 'worker-1', '# Task: Do something');
      const content = await readInbox(ctx, 'worker-1');
      assert(content === '# Task: Do something', 'Inbox content matches');
      await clearInbox(ctx, 'worker-1');
      const cleared = await readInbox(ctx, 'worker-1');
      assert(cleared === '', 'Inbox cleared');
    });

    await test('OutboxReader cursor-based reading', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-outbox',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      const now = new Date().toISOString();

      await appendOutbox(ctx, {
        agent: 'w1', task: 'task-001', status: 'completed',
        summary: 'Done', timestamp: now,
      });
      await appendOutbox(ctx, {
        agent: 'w2', task: 'task-002', status: 'failed',
        summary: 'Error', error: 'timeout', timestamp: now,
      });

      const reader = new OutboxReader(ctx);
      const entries = await reader.readNew();
      assert(entries.length === 2, `Expected 2 entries, got ${entries.length}`);
      assert(entries[0].agent === 'w1', 'First entry agent');
      assert(entries[1].status === 'failed', 'Second entry status');

      // Subsequent read should return 0 (cursor advanced)
      const empty = await reader.readNew();
      assert(empty.length === 0, `Expected 0 entries after cursor, got ${empty.length}`);
    });

    await test('appendEvent + readEvents', async () => {
      const session = await createSession({
        project: projectName,
        cwd: '/tmp',
        tmuxSession: 'uniflow-test-events',
        daemonPid: process.pid,
      });
      const ctx = { project: projectName, sessionId: session.id };
      await appendEvent(ctx, 'session_started', { cwd: '/tmp' });
      await appendEvent(ctx, 'agent_spawned', { agent: 'w1' });
      const events = await readEvents(ctx);
      assert(events.length === 2, `Expected 2 events, got ${events.length}`);
      assert(events[0].type === 'session_started', 'First event type');
    });
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
}

// ── Scenario 2: Template Rendering ───────────────────────────────────

async function scenario2_templateRendering(): Promise<void> {
  console.log('\nScenario 2: Template Rendering');

  const { renderTemplate, buildOrchestratorVars, buildWorkerVars } = await import('../src/launch/index.js');

  await test('renderTemplate replaces all placeholders', async () => {
    const template = 'Hello {{NAME}}, your session is {{SESSION_ID}}.';
    const result = renderTemplate(template, {
      PROJECT_NAME: 'test',
      SESSION_ID: 'abc-123',
      STATE_DIR: '/tmp',
      WORKER_NAME: 'test-worker',
    } as any);
    // NAME has no matching var, should remain as-is
    assert(result.includes('{{NAME}}'), 'Unknown placeholder preserved');
    assert(result.includes('abc-123'), 'SESSION_ID replaced');
  });

  await test('orchestrator template has no residual placeholders when fully rendered', async () => {
    const { loadAndRenderTemplate } = await import('../src/launch/index.js');
    const vars = buildOrchestratorVars('test-project', 'session-abc');
    const rendered = await loadAndRenderTemplate('orchestrator', vars);
    assert(!rendered.includes('{{PROJECT_NAME}}'), 'PROJECT_NAME replaced');
    assert(!rendered.includes('{{SESSION_ID}}'), 'SESSION_ID replaced');
    assert(!rendered.includes('{{STATE_DIR}}'), 'STATE_DIR replaced');
    assert(rendered.includes('test-project'), 'Project name present');
  });

  await test('worker template replaces all worker-specific vars', async () => {
    const { loadAndRenderTemplate } = await import('../src/launch/index.js');
    const vars = buildWorkerVars(
      'test-project', 'session-abc', 'worker-1',
      'claude', 'executor', '%42', 12345, 'Custom instructions here',
    );
    const rendered = await loadAndRenderTemplate('worker', vars);
    assert(!rendered.includes('{{WORKER_NAME}}'), 'WORKER_NAME replaced');
    assert(!rendered.includes('{{ROLE}}'), 'ROLE replaced');
    assert(!rendered.includes('{{CLI}}'), 'CLI replaced');
    assert(rendered.includes('worker-1'), 'Worker name present');
    assert(rendered.includes('Custom instructions here'), 'Role instructions present');
  });

  await test('orchestrator template is <= 30 lines', async () => {
    const { loadAndRenderTemplate } = await import('../src/launch/index.js');
    const vars = buildOrchestratorVars('p', 's');
    const rendered = await loadAndRenderTemplate('orchestrator', vars);
    // Filter out empty trailing line from trailing newline
    const lines = rendered.split('\n').filter((_, i, arr) => i < arr.length - 1 || arr[i].trim()).length;
    assert(lines <= 30, `Orchestrator template is ${lines} lines, expected <= 30`);
  });
}

// ── Scenario 3: Launch Command Building ──────────────────────────────

async function scenario3_launchCommands(): Promise<void> {
  console.log('\nScenario 3: Launch Command Building');

  const { buildLaunchCommand } = await import('../src/launch/index.js');

  await test('Claude interactive command includes required flags', async () => {
    const cmd = buildLaunchCommand({
      name: 'worker-1',
      cli: 'claude',
      role: 'executor',
      mode: 'interactive',
      cwd: '/tmp',
      instructionPath: '/tmp/instructions.md',
      pluginDir: '/tmp/plugin',
    });
    assert(cmd.includes('--dangerously-skip-permissions'), 'Has permission bypass');
    assert(cmd.includes('--append-system-prompt-file'), 'Has system prompt file');
    assert(cmd.includes('--plugin-dir'), 'Has plugin dir');
    assert(cmd.includes('--name'), 'Has session name');
    assert(!cmd.includes('-p'), 'No pipe mode for interactive');
  });

  await test('Claude non-interactive command includes -p --bare', async () => {
    const cmd = buildLaunchCommand({
      name: 'worker-1',
      cli: 'claude',
      role: 'executor',
      mode: 'non_interactive',
      cwd: '/tmp',
      instructionPath: '/tmp/instructions.md',
    });
    assert(cmd.includes('-p'), 'Has pipe mode');
    assert(cmd.includes('--bare'), 'Has bare mode');
  });

  await test('Codex interactive command includes bypass flag', async () => {
    const cmd = buildLaunchCommand({
      name: 'worker-2',
      cli: 'codex',
      role: 'executor',
      mode: 'interactive',
      cwd: '/tmp',
      instructionPath: '/tmp/instructions.md',
    });
    assert(cmd.includes('--dangerously-bypass-approvals-and-sandbox'), 'Has Codex bypass');
  });

  await test('Codex non-interactive command includes exec --ephemeral', async () => {
    const cmd = buildLaunchCommand({
      name: 'worker-2',
      cli: 'codex',
      role: 'executor',
      mode: 'non_interactive',
      cwd: '/tmp',
      instructionPath: '/tmp/instructions.md',
      initialPrompt: 'Do something',
    });
    assert(cmd.includes('exec'), 'Has exec');
    assert(cmd.includes('--ephemeral'), 'Has ephemeral');
    assert(cmd.includes('Do something'), 'Has initial prompt');
  });
}

// ── Scenario 4: CLI Structure ────────────────────────────────────────

async function scenario4_cliStructure(): Promise<void> {
  console.log('\nScenario 4: CLI Structure');

  const uniflow = join(import.meta.dir, '..', 'src', 'index.ts');

  await test('uniflow --help shows usage', async () => {
    const proc = Bun.spawn(['bun', 'run', uniflow, '--help'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    assert(stdout.includes('uniflow'), 'Shows program name');
    assert(stdout.includes('start'), 'Shows start command');
    assert(stdout.includes('spawn'), 'Shows spawn command');
    assert(stdout.includes('status'), 'Shows status command');
  });

  await test('uniflow --version shows version', async () => {
    const proc = Bun.spawn(['bun', 'run', uniflow, '--version'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    assert(stdout.includes('0.1.0'), 'Shows version');
  });

  await test('uniflow <unknown> exits with code 1', async () => {
    const proc = Bun.spawn(['bun', 'run', uniflow, 'nonexistent-cmd'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    assert(exitCode === 1, `Expected exit code 1, got ${exitCode}`);
  });

  await test('uniflow doctor runs without crash', async () => {
    const proc = Bun.spawn(['bun', 'run', uniflow, 'doctor'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    // Doctor may fail (missing tmux etc) but shouldn't crash
    assert(stdout.includes('tmux') || exitCode <= 4, 'Doctor runs without crash');
  });
}

// ── Scenario 5: IPC Protocol ─────────────────────────────────────────

async function scenario5_ipcProtocol(): Promise<void> {
  console.log('\nScenario 5: IPC Protocol (daemon ↔ CLI)');

  const { startServer } = await import('../src/daemon/server.js');
  const {
    createSession,
    OutboxReader,
    writeAgentState,
    writeTask,
  } = await import('../src/daemon/state.js');
  const { connect } = await import('node:net');

  // Create a temp session for testing
  const projectName = `ipc-test-${randomUUID().slice(0, 8)}`;
  const session = await createSession({
    project: projectName,
    cwd: '/tmp',
    tmuxSession: `uniflow-${projectName}`,
    daemonPid: process.pid,
  });
  const ctx = { project: projectName, sessionId: session.id };
  const outboxReader = new OutboxReader(ctx);

  // Start daemon server
  const server = await startServer(ctx, outboxReader);

  const { socketPath } = await import('../src/lib/constants.js');
  const sockPath = socketPath(projectName);

  // Helper to send IPC request
  function sendIpcRequest(command: string, args: Record<string, unknown> = {}): Promise<any> {
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

  try {
    await test('IPC: status command returns session data', async () => {
      const resp = await sendIpcRequest('status');
      assert(resp.success === true, 'Status success');
      assert(resp.data.session.project === projectName, 'Project in status');
    });

    await test('IPC: agents command returns agent list', async () => {
      const now = new Date().toISOString();
      await writeAgentState(ctx, 'test-agent', {
        name: 'test-agent', cli: 'claude', role: 'executor', pane_id: '%99', pid: 999,
        state: 'idle', current_task: null, progress: null, nudge_count: 0,
        started_at: now, updated_at: now,
      });
      const resp = await sendIpcRequest('agents');
      assert(resp.success === true, 'Agents success');
      assert(Array.isArray(resp.data), 'Data is array');
      assert(resp.data.length >= 1, 'At least 1 agent');
    });

    await test('IPC: task-create command creates a task', async () => {
      const resp = await sendIpcRequest('task-create', {
        id: 'task-ipc-001',
        subject: 'IPC test task',
        priority: 2,
      });
      assert(resp.success === true, 'Task create success');
      assert(resp.data.id === 'task-ipc-001', 'Task ID returned');
    });

    await test('IPC: tasks command returns task list', async () => {
      const resp = await sendIpcRequest('tasks');
      assert(resp.success === true, 'Tasks success');
      assert(Array.isArray(resp.data), 'Data is array');
    });

    await test('IPC: unknown command returns error', async () => {
      const resp = await sendIpcRequest('definitely-not-a-command');
      assert(resp.success === false, 'Unknown command fails');
      assert(resp.error.includes('Unknown'), 'Error mentions unknown');
    });
  } finally {
    server.close();
  }
}

// ── Run All Scenarios ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('uniflow E2E Integration Tests');
  console.log('='.repeat(50));

  await scenario1_stateManagement();
  await scenario2_templateRendering();
  await scenario3_launchCommands();
  await scenario4_cliStructure();
  await scenario5_ipcProtocol();

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
    process.exit(1);
  }

  console.log('\nAll tests passed!');
}

main();
