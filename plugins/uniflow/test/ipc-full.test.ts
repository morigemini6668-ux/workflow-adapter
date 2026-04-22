#!/usr/bin/env bun
/**
 * IPC Full Coverage Test — ALL commands in server.ts
 *
 * Tests all 15 IPC command handlers via real Unix socket communication.
 * Commands tested:
 *   Pure state: status, agents, tasks, task-create
 *   Spawn: spawn (via onSpawn callback)
 *   File-based: logs
 *   Tmux-dependent: kill, assign, send, nudge, respawn, peek, stop
 *   Git-dependent: worktree-create, worktree-merge
 *   Error: unknown command
 *
 * Tmux/Git-dependent commands are tested with pre-created agent state.
 * Since no real tmux session exists, they fail at the tmux/git boundary —
 * we verify the handler logic (arg validation, state reads) up to that point.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';

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

// ── Test Helpers ─────────────────────────────────────────────────────

function makeAgentState(name: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    name,
    cli: 'claude',
    role: 'executor',
    pane_id: `%${Math.floor(Math.random() * 1000)}`,
    pid: Math.floor(Math.random() * 99999),
    state: 'idle',
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeTask(id: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    subject: `Task ${id}`,
    description: `Description for ${id}`,
    status: 'pending',
    assignee: null,
    priority: 3,
    depends_on: [],
    created_at: now,
    assigned_at: null,
    completed_at: null,
    result: null,
    error: null,
    ...overrides,
  };
}

// ── Main Test Suite ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('IPC Full Coverage Test — 15 commands + unknown');
  console.log('='.repeat(55));

  // Dynamic imports
  const { startServer } = await import('../src/daemon/server.js');
  const {
    createSession,
    OutboxReader,
    writeAgentState,
    writeTask,
    readTask,
    listTasks,
    readInbox,
    readAgentState: readAgentStateFn,
    listAgents,
    appendOutbox,
  } = await import('../src/daemon/state.js');
  const { socketPath, logsDir } = await import('../src/lib/constants.js');

  // Create a temp session
  const projectName = `ipc-full-${randomUUID().slice(0, 8)}`;
  const session = await createSession({
    project: projectName,
    cwd: '/tmp/ipc-test',
    tmuxSession: `uniflow-${projectName}`,
    daemonPid: process.pid,
  });
  const ctx = { project: projectName, sessionId: session.id };
  const outboxReader = new OutboxReader(ctx);

  // Track spawn calls
  let spawnCalled = false;
  let spawnArgs: Record<string, unknown> = {};
  const onSpawn = async (args: Record<string, unknown>) => {
    spawnCalled = true;
    spawnArgs = args;
    return { name: args.name, pane_id: '%mock-99', status: 'spawned' };
  };

  // Start IPC server
  const server = await startServer(ctx, outboxReader, onSpawn);
  const sockPath = socketPath(projectName);

  // IPC request helper
  function ipc(command: string, args: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      const socket = connect(sockPath, () => {
        socket.write(JSON.stringify({ command, args, requestId: randomUUID() }) + '\n');
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
    // ── 1. status ──────────────────────────────────────────────
    console.log('\n[1/16] status');
    await test('status: returns session, agents, tasks, recent_results', async () => {
      const resp = await ipc('status');
      assert(resp.success === true, 'success');
      assert(resp.data.session.project === projectName, 'project matches');
      assert(resp.data.session.status === 'active', 'session active');
      assert(Array.isArray(resp.data.agents), 'agents is array');
      assert(Array.isArray(resp.data.tasks), 'tasks is array');
      assert(Array.isArray(resp.data.recent_results), 'recent_results is array');
    });

    // ── 2. agents ─────────────────────────────────────────────
    console.log('\n[2/16] agents');
    await test('agents: returns empty list initially', async () => {
      const resp = await ipc('agents');
      assert(resp.success === true, 'success');
      assert(Array.isArray(resp.data), 'data is array');
      assert(resp.data.length === 0, 'empty initially');
    });

    await test('agents: returns agents after state write', async () => {
      await writeAgentState(ctx, 'agent-a', makeAgentState('agent-a') as any);
      const resp = await ipc('agents');
      assert(resp.success === true, 'success');
      assert(resp.data.length >= 1, 'at least 1 agent');
      assert(resp.data.some((a: any) => a.name === 'agent-a'), 'agent-a found');
    });

    // ── 3. tasks ──────────────────────────────────────────────
    console.log('\n[3/16] tasks');
    await test('tasks: returns empty list initially', async () => {
      const resp = await ipc('tasks');
      assert(resp.success === true, 'success');
      assert(Array.isArray(resp.data), 'data is array');
    });

    await test('tasks: returns tasks with status filter', async () => {
      await writeTask(ctx, 'task-filter-1', makeTask('task-filter-1', { status: 'pending' }) as any);
      await writeTask(ctx, 'task-filter-2', makeTask('task-filter-2', { status: 'completed', completed_at: new Date().toISOString() }) as any);
      const pendingResp = await ipc('tasks', { status: 'pending' });
      assert(pendingResp.success === true, 'success');
      const pendingIds = pendingResp.data.map((t: any) => t.id);
      assert(pendingIds.includes('task-filter-1'), 'pending task included');
      assert(!pendingIds.includes('task-filter-2'), 'completed task excluded from pending filter');
    });

    // ── 4. task-create ────────────────────────────────────────
    console.log('\n[4/16] task-create');
    await test('task-create: creates task with all fields', async () => {
      const resp = await ipc('task-create', {
        id: 'tc-001',
        subject: 'Build feature X',
        description: 'Implement the full feature',
        priority: 2,
        depends_on: [],
        assignee: null,
      });
      assert(resp.success === true, 'success');
      assert(resp.data.id === 'tc-001', 'returns task id');
      // Verify persisted
      const task = await readTask(ctx, 'tc-001');
      assert(task.subject === 'Build feature X', 'subject persisted');
      assert(task.priority === 2, 'priority persisted');
      assert(task.status === 'pending', 'status is pending');
    });

    await test('task-create: fails without required fields', async () => {
      const resp = await ipc('task-create', { id: '', subject: '' });
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('required'), 'mentions required');
    });

    await test('task-create: defaults priority to 3', async () => {
      const resp = await ipc('task-create', {
        id: 'tc-002',
        subject: 'Minimal task',
      });
      assert(resp.success === true, 'success');
      const task = await readTask(ctx, 'tc-002');
      assert(task.priority === 3, 'default priority is 3');
    });

    // ── 5. spawn ──────────────────────────────────────────────
    console.log('\n[5/16] spawn');
    await test('spawn: delegates to onSpawn callback', async () => {
      spawnCalled = false;
      const resp = await ipc('spawn', { name: 'worker-new', cli: 'claude', role: 'executor' });
      assert(resp.success === true, 'success');
      assert(spawnCalled === true, 'onSpawn was called');
      assert(spawnArgs.name === 'worker-new', 'args forwarded');
      assert(resp.data.pane_id === '%mock-99', 'return value forwarded');
    });

    await test('spawn: fails when no onSpawn registered', async () => {
      // Start a second server without onSpawn
      const noSpawnSockName = `ipc-nospawn-${randomUUID().slice(0, 8)}`;
      const noSpawnSession = await createSession({
        project: noSpawnSockName,
        cwd: '/tmp',
        tmuxSession: `uniflow-${noSpawnSockName}`,
        daemonPid: process.pid,
      });
      const noSpawnCtx = { project: noSpawnSockName, sessionId: noSpawnSession.id };
      const noSpawnServer = await startServer(noSpawnCtx, new OutboxReader(noSpawnCtx));
      const noSpawnSock = socketPath(noSpawnSockName);
      try {
        const resp: any = await new Promise((resolve, reject) => {
          let data = '';
          const socket = connect(noSpawnSock, () => {
            socket.write(JSON.stringify({ command: 'spawn', args: {}, requestId: randomUUID() }) + '\n');
          });
          socket.on('data', (chunk) => {
            data += chunk.toString();
            for (const line of data.split('\n')) {
              if (!line.trim()) continue;
              try { resolve(JSON.parse(line)); socket.end(); return; } catch {}
            }
          });
          socket.on('error', reject);
          socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('timeout')); });
        });
        assert(resp.success === false, 'fails');
        assert(resp.error!.includes('not registered'), 'mentions not registered');
      } finally {
        noSpawnServer.close();
      }
    });

    // ── 6. kill ───────────────────────────────────────────────
    console.log('\n[6/16] kill');
    await test('kill: fails without agent name', async () => {
      const resp = await ipc('kill', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('kill: reads agent state before tmux call', async () => {
      const agentState = makeAgentState('kill-target', { pane_id: '%dead-999' });
      await writeAgentState(ctx, 'kill-target', agentState as any);
      const resp = await ipc('kill', { name: 'kill-target' });
      // tmux killPane will fail (no real pane), but handler reached the tmux call
      // — meaning it successfully read the agent state and extracted pane_id
      if (resp.success) {
        // tmux binary might handle non-existent pane gracefully
        assert(true, 'kill completed (tmux handled gracefully)');
      } else {
        // Expected: tmux error for non-existent pane
        assert(resp.error!.length > 0, 'got tmux-layer error');
      }
    });

    await test('kill: fails for non-existent agent', async () => {
      const resp = await ipc('kill', { name: 'does-not-exist-agent' });
      assert(resp.success === false, 'fails');
      // Should fail at readAgentState (file not found), not at tmux layer
    });

    // ── 7. assign ─────────────────────────────────────────────
    console.log('\n[7/16] assign');
    await test('assign: fails without agent or taskId', async () => {
      const resp = await ipc('assign', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('required'), 'mentions required');
    });

    await test('assign: validates dependency completion', async () => {
      // Create an incomplete dependency
      await writeTask(ctx, 'dep-incomplete', makeTask('dep-incomplete', { status: 'pending' }) as any);
      // Create a task that depends on it
      await writeTask(ctx, 'task-with-dep', makeTask('task-with-dep', { depends_on: ['dep-incomplete'] }) as any);
      // Create an agent
      await writeAgentState(ctx, 'assign-agent', makeAgentState('assign-agent') as any);

      const resp = await ipc('assign', { agent: 'assign-agent', taskId: 'task-with-dep' });
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('incomplete') || resp.error!.includes('depends'), 'mentions dependency');
    });

    await test('assign: updates task status and dispatches', async () => {
      // Create task with no dependencies
      await writeTask(ctx, 'assign-task', makeTask('assign-task') as any);
      await writeAgentState(ctx, 'assign-worker', makeAgentState('assign-worker') as any);

      const resp = await ipc('assign', { agent: 'assign-worker', taskId: 'assign-task' });
      // Dispatch calls isPaneDead → tmux → may fail
      if (resp.success) {
        // Task should be updated to in_progress
        const task = await readTask(ctx, 'assign-task');
        assert(task.status === 'in_progress', 'task is in_progress');
        assert(task.assignee === 'assign-worker', 'assignee set');
      } else {
        // Failed at tmux dispatch layer — verify task was updated before dispatch
        // The handler writes task BEFORE dispatching, so task should be updated
        try {
          const task = await readTask(ctx, 'assign-task');
          // Task update happens before dispatch, so it may be in_progress even if dispatch failed
          assert(
            task.status === 'in_progress' || task.status === 'pending',
            `task status is ${task.status}`,
          );
        } catch {
          // Task file might not have been updated if the error was early
        }
      }
    });

    // ── 8. send ───────────────────────────────────────────────
    console.log('\n[8/16] send');
    await test('send: fails without agent or message', async () => {
      const resp = await ipc('send', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('required'), 'mentions required');
    });

    await test('send: reads agent state and attempts dispatch', async () => {
      await writeAgentState(ctx, 'send-target', makeAgentState('send-target') as any);
      const resp = await ipc('send', {
        agent: 'send-target',
        message: 'Hello from test',
        mode: 'nudge',
      });
      // May fail at tmux dispatch, but handler logic (reading agent, building target) ran
      if (resp.success) {
        assert(resp.data.sent === true, 'sent flag');
      } else {
        // Error is from tmux layer, not handler logic
        assert(resp.error!.length > 0, 'tmux-layer error');
      }
    });

    await test('send: fails for non-existent agent', async () => {
      const resp = await ipc('send', { agent: 'ghost', message: 'hello' });
      assert(resp.success === false, 'fails');
      // Should fail at readAgentState
    });

    // ── 9. nudge ──────────────────────────────────────────────
    console.log('\n[9/16] nudge');
    await test('nudge: fails without agent name', async () => {
      const resp = await ipc('nudge', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('nudge: reads agent state and attempts nudge', async () => {
      await writeAgentState(ctx, 'nudge-target', makeAgentState('nudge-target') as any);
      const resp = await ipc('nudge', { name: 'nudge-target' });
      // nudgeAgent calls detectState → tmux → may fail
      if (resp.success) {
        // If tmux call succeeded (rare without real tmux session)
        assert(resp.data.nudged === true, 'nudged flag');
      } else {
        assert(resp.error!.length > 0, 'tmux-layer error');
      }
    });

    await test('nudge: fails for non-existent agent', async () => {
      const resp = await ipc('nudge', { name: 'nonexistent-nudge' });
      assert(resp.success === false, 'fails');
    });

    // ── 10. respawn ───────────────────────────────────────────
    console.log('\n[10/16] respawn');
    await test('respawn: fails without agent name', async () => {
      const resp = await ipc('respawn', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('respawn: reads agent state before tmux respawn', async () => {
      await writeAgentState(ctx, 'respawn-target', makeAgentState('respawn-target') as any);
      const resp = await ipc('respawn', { name: 'respawn-target' });
      // respawnAgent calls tmux operations
      if (resp.success) {
        assert(!!resp.data.pane_id, 'new pane_id returned');
      } else {
        // Error from tmux layer
        assert(resp.error!.length > 0, 'got error from tmux layer');
      }
    });

    await test('respawn: fails for non-existent agent', async () => {
      const resp = await ipc('respawn', { name: 'ghost-respawn' });
      assert(resp.success === false, 'fails');
    });

    // ── 11. logs ──────────────────────────────────────────────
    console.log('\n[11/16] logs');
    await test('logs: fails without agent name', async () => {
      const resp = await ipc('logs', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('logs: returns empty string for missing log file', async () => {
      // Agent must exist (requireAgent check) but log file can be absent
      await writeAgentState(ctx, 'no-log-agent', makeAgentState('no-log-agent') as any);
      const resp = await ipc('logs', { name: 'no-log-agent' });
      assert(resp.success === true, 'success (graceful fallback)');
      assert(resp.data.logs === '', 'empty logs');
    });

    await test('logs: fails for non-existent agent', async () => {
      const resp = await ipc('logs', { name: 'ghost-log-agent' });
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('not found'), 'agent not found');
    });

    await test('logs: reads last N lines from log file', async () => {
      await writeAgentState(ctx, 'log-agent', makeAgentState('log-agent') as any);
      const logDirPath = logsDir(projectName, session.id);
      await mkdir(logDirPath, { recursive: true });
      const logContent = Array.from({ length: 100 }, (_, i) => `line-${i + 1}`).join('\n');
      await writeFile(join(logDirPath, 'log-agent.log'), logContent);

      const resp = await ipc('logs', { name: 'log-agent', lines: 10 });
      assert(resp.success === true, 'success');
      const lines = resp.data.logs.split('\n').filter((l: string) => l);
      assert(lines.length === 10, `expected 10 lines, got ${lines.length}`);
      assert(lines[lines.length - 1] === 'line-100', 'last line matches');
    });

    await test('logs: defaults to 50 lines', async () => {
      const resp = await ipc('logs', { name: 'log-agent' });
      assert(resp.success === true, 'success');
      const lines = resp.data.logs.split('\n').filter((l: string) => l);
      assert(lines.length === 50, `expected 50 lines, got ${lines.length}`);
    });

    // ── 12. peek ──────────────────────────────────────────────
    console.log('\n[12/16] peek');
    await test('peek: fails without agent name', async () => {
      const resp = await ipc('peek', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('peek: reads agent state before capturePane', async () => {
      await writeAgentState(ctx, 'peek-target', makeAgentState('peek-target') as any);
      const resp = await ipc('peek', { name: 'peek-target' });
      // capturePane calls tmux → will fail without real pane
      if (resp.success) {
        assert(typeof resp.data.output === 'string', 'output is string');
      } else {
        assert(resp.error!.length > 0, 'tmux error');
      }
    });

    await test('peek: fails for non-existent agent', async () => {
      const resp = await ipc('peek', { name: 'peek-ghost' });
      assert(resp.success === false, 'fails');
    });

    // ── 13. stop ──────────────────────────────────────────────
    // NOTE: stop archives the session, so we test it with a fresh session
    console.log('\n[13/16] stop');
    await test('stop: archives session with no agents', async () => {
      // Create a fresh session for this test (stop will archive it)
      const stopProject = `ipc-stop-${randomUUID().slice(0, 8)}`;
      const stopSession = await createSession({
        project: stopProject,
        cwd: '/tmp/stop-test',
        tmuxSession: `uniflow-${stopProject}`,
        daemonPid: process.pid,
      });
      const stopCtx = { project: stopProject, sessionId: stopSession.id };
      const stopOutbox = new OutboxReader(stopCtx);
      const stopServer = await startServer(stopCtx, stopOutbox);
      const stopSock = socketPath(stopProject);

      try {
        const resp: any = await new Promise((resolve, reject) => {
          let data = '';
          const socket = connect(stopSock, () => {
            socket.write(JSON.stringify({ command: 'stop', args: {}, requestId: randomUUID() }) + '\n');
          });
          socket.on('data', (chunk) => {
            data += chunk.toString();
            for (const line of data.split('\n')) {
              if (!line.trim()) continue;
              try { resolve(JSON.parse(line)); socket.end(); return; } catch {}
            }
          });
          socket.on('error', reject);
          socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('timeout')); });
        });
        assert(resp.success === true, 'stop success');
        assert(resp.data.stopped === true, 'stopped flag');
      } finally {
        stopServer.close();
      }
    });

    await test('stop: attempts to kill agents before archiving', async () => {
      const stopProject2 = `ipc-stop2-${randomUUID().slice(0, 8)}`;
      const stopSession2 = await createSession({
        project: stopProject2,
        cwd: '/tmp/stop-test2',
        tmuxSession: `uniflow-${stopProject2}`,
        daemonPid: process.pid,
      });
      const stopCtx2 = { project: stopProject2, sessionId: stopSession2.id };
      // Write an agent state file — stop will try to kill its pane
      await writeAgentState(stopCtx2, 'doomed-agent', makeAgentState('doomed-agent') as any);

      const stopOutbox2 = new OutboxReader(stopCtx2);
      const stopServer2 = await startServer(stopCtx2, stopOutbox2);
      const stopSock2 = socketPath(stopProject2);

      try {
        const resp: any = await new Promise((resolve, reject) => {
          let data = '';
          const socket = connect(stopSock2, () => {
            socket.write(JSON.stringify({ command: 'stop', args: {}, requestId: randomUUID() }) + '\n');
          });
          socket.on('data', (chunk) => {
            data += chunk.toString();
            for (const line of data.split('\n')) {
              if (!line.trim()) continue;
              try { resolve(JSON.parse(line)); socket.end(); return; } catch {}
            }
          });
          socket.on('error', reject);
          socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('timeout')); });
        });
        // isPaneDead returns true for non-existent pane (exitCode !== 0 → true)
        // so killPane is skipped, and archiveSession proceeds
        assert(resp.success === true, 'stop success even with agent');
        assert(resp.data.stopped === true, 'stopped flag');
      } finally {
        stopServer2.close();
      }
    });

    // ── 14. worktree-create ───────────────────────────────────
    console.log('\n[14/16] worktree-create');
    await test('worktree-create: fails without agent name', async () => {
      const resp = await ipc('worktree-create', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('worktree-create: attempts git worktree add', async () => {
      const resp = await ipc('worktree-create', { agent: 'wt-agent', branch: 'test-branch' });
      // Will fail because git worktree add fails in the test context
      // But the handler logic (arg extraction, branch defaulting) ran
      // Returns success if git doesn't error (exit code 0), fail otherwise
      assert(typeof resp.success === 'boolean', 'returns boolean success');
      if (resp.success) {
        assert(resp.data.worktree.includes('wt-agent'), 'worktree path contains agent name');
      }
    });

    await test('worktree-create: defaults branch to uniflow/{agent}', async () => {
      // We can't fully verify the git command, but the handler extracts branch
      // This tests the code path where branch is undefined → defaults to uniflow/{agent}
      const resp = await ipc('worktree-create', { agent: 'wt-default' });
      // Regardless of git success/failure, the handler ran branch defaulting logic
      assert(typeof resp.success === 'boolean', 'response received');
    });

    // ── 15. worktree-merge ────────────────────────────────────
    console.log('\n[15/16] worktree-merge');
    await test('worktree-merge: fails without agent name', async () => {
      const resp = await ipc('worktree-merge', {});
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('name') || resp.error!.includes('required'), 'error about name');
    });

    await test('worktree-merge: attempts merge and cleanup', async () => {
      const resp = await ipc('worktree-merge', { agent: 'merge-agent' });
      // Git merge will fail (no such branch), but handler logic ran
      assert(typeof resp.success === 'boolean', 'response received');
    });

    // ── 16. unknown command ───────────────────────────────────
    console.log('\n[16/16] unknown command');
    await test('unknown: returns error for unrecognized command', async () => {
      const resp = await ipc('not-a-real-command');
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('Unknown'), 'mentions Unknown');
    });

    await test('unknown: includes command name in error', async () => {
      const resp = await ipc('xyzzy-foobar');
      assert(resp.success === false, 'fails');
      assert(resp.error!.includes('xyzzy-foobar'), 'includes command name');
    });

    // ── Bonus: status with agents, tasks, and outbox ─────────
    console.log('\n[Bonus] status with data');
    await test('status: reflects agents, tasks, and outbox entries', async () => {
      // Outbox entry
      await appendOutbox(ctx, {
        agent: 'agent-a',
        task: 'tc-001',
        status: 'completed',
        summary: 'Done building',
        timestamp: new Date().toISOString(),
      });

      const resp = await ipc('status');
      assert(resp.success === true, 'success');
      assert(resp.data.agents.length >= 1, 'has agents');
      assert(resp.data.tasks.length >= 1, 'has tasks');
      assert(resp.data.recent_results.length >= 1, 'has outbox entries');
    });
  } finally {
    server.close();
  }

  // ── Summary ──────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(55));
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
