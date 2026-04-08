#!/usr/bin/env bun
/**
 * state.test.ts — Verification tests for src/daemon/state.ts
 *
 * Covers:
 * 1. createSession() → session.json exists + agents/, inboxes/, tasks/ dirs exist
 * 2. writeInbox() → no *.tmp.* files remain after write
 * 3. Zod validation: invalid data to writeAgentState/writeTask → ZodError thrown
 * 4. archiveSession() → session dir moved to archive/ + original deleted
 */

import { existsSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import {
  createSession,
  archiveSession,
  writeAgentState,
  readAgentState,
  writeTask,
  writeInbox,
  readInbox,
} from '../src/daemon/state.js';
import {
  projectDir,
  sessionDir,
  agentsDir,
  inboxesDir,
  tasksDir,
  archiveDir,
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

const PROJECT = `state-test-${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function makeAgentState(overrides: Record<string, unknown> = {}) {
  const ts = now();
  return {
    name: 'w1',
    cli: 'claude' as const,
    role: 'executor',
    pane_id: '%1',
    pid: 1,
    state: 'idle' as const,
    current_task: null,
    progress: null,
    nudge_count: 0,
    started_at: ts,
    updated_at: ts,
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  const ts = now();
  return {
    id: 'task-001',
    subject: 'Test',
    description: 'Test task',
    status: 'pending' as const,
    assignee: null,
    priority: 1,
    depends_on: [],
    created_at: ts,
    assigned_at: null,
    completed_at: null,
    result: null,
    error: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('state.test.ts — State Management Verification');
  console.log('='.repeat(50));

  // ── 1. createSession → filesystem structure ─────────────────────

  console.log('\n1. createSession filesystem structure');

  let sessionId: string;

  await test('createSession creates session.json file', async () => {
    const session = await createSession({
      project: PROJECT,
      cwd: '/tmp/test',
      tmuxSession: `uniflow-${PROJECT}`,
      daemonPid: process.pid,
    });
    sessionId = session.id;
    const sessionJsonPath = join(sessionDir(PROJECT, sessionId), 'session.json');
    assert(existsSync(sessionJsonPath), `session.json not found at ${sessionJsonPath}`);
  });

  await test('createSession creates agents/ directory', async () => {
    assert(existsSync(agentsDir(PROJECT, sessionId!)), 'agents/ dir missing');
  });

  await test('createSession creates inboxes/ directory', async () => {
    assert(existsSync(inboxesDir(PROJECT, sessionId!)), 'inboxes/ dir missing');
  });

  await test('createSession creates tasks/ directory', async () => {
    assert(existsSync(tasksDir(PROJECT, sessionId!)), 'tasks/ dir missing');
  });

  // ── 2. writeInbox → no tmp files remain ─────────────────────────

  console.log('\n2. writeInbox atomicity (no leftover tmp files)');

  await test('writeInbox leaves no *.tmp.* files', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    // Write several times to increase chance of catching leaked tmp files
    await writeInbox(ctx, 'w1', 'message 1');
    await writeInbox(ctx, 'w1', 'message 2');
    await writeInbox(ctx, 'w1', 'message 3');

    const inboxDir = inboxesDir(PROJECT, sessionId!);
    const files = readdirSync(inboxDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    assert(tmpFiles.length === 0, `Found leftover tmp files: ${tmpFiles.join(', ')}`);

    // Verify content is correct (last write wins)
    const content = await readInbox(ctx, 'w1');
    assert(content === 'message 3', `Expected 'message 3', got '${content}'`);
  });

  // ── 3. Zod validation rejects invalid data ──────────────────────

  console.log('\n3. Zod validation on writeAgentState / writeTask');

  await test('writeAgentState rejects invalid state (missing required field)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      // Missing 'name' and other required fields
      await writeAgentState(ctx, 'bad', { garbage: true } as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  await test('writeAgentState rejects invalid state (wrong type)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      // pid should be number, not string
      await writeAgentState(ctx, 'bad', makeAgentState({ pid: 'not-a-number' }) as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  await test('writeAgentState rejects invalid state (invalid enum)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      // 'invalid-state' is not in AGENT_STATES
      await writeAgentState(ctx, 'bad', makeAgentState({ state: 'invalid-state' }) as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  await test('writeTask rejects invalid task (missing required field)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      await writeTask(ctx, 'bad', { garbage: true } as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  await test('writeTask rejects invalid task (priority out of range)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      // priority must be 1-5
      await writeTask(ctx, 'bad', makeTask({ priority: 99 }) as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  await test('writeTask rejects invalid task (invalid status enum)', async () => {
    const ctx = { project: PROJECT, sessionId: sessionId! };
    try {
      await writeTask(ctx, 'bad', makeTask({ status: 'nonexistent' }) as any);
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof ZodError, `Expected ZodError, got ${(err as Error).constructor.name}`);
    }
  });

  // ── 4. archiveSession → move + delete original ──────────────────

  console.log('\n4. archiveSession moves session and deletes original');

  await test('archiveSession moves session dir to archive/', async () => {
    // Create a fresh session to archive
    const session = await createSession({
      project: PROJECT,
      cwd: '/tmp/archive-test',
      tmuxSession: `uniflow-${PROJECT}-archive`,
      daemonPid: process.pid,
    });
    const ctx = { project: PROJECT, sessionId: session.id };

    // Write some data so the session isn't empty
    await writeAgentState(ctx, 'w1', makeAgentState());
    await writeInbox(ctx, 'w1', 'archive me');

    const originalDir = sessionDir(PROJECT, session.id);
    const archivedDir = archiveDir(PROJECT, session.id);

    // Verify original exists before archive
    assert(existsSync(originalDir), 'Original session dir should exist before archive');

    await archiveSession(ctx);

    // Original should be gone
    assert(!existsSync(originalDir), 'Original session dir should be deleted after archive');

    // Archive should exist with content
    assert(existsSync(archivedDir), 'Archive dir should exist');
    assert(existsSync(join(archivedDir, 'session.json')), 'Archived session.json should exist');
    assert(existsSync(join(archivedDir, 'agents', 'w1.json')), 'Archived agent state should exist');
    assert(existsSync(join(archivedDir, 'inboxes', 'w1.md')), 'Archived inbox should exist');
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
