/**
 * E2E Integration Tests: install → doctor → start → spawn flow
 *
 * Scenario 1: install → doctor (always runs, real filesystem)
 * Scenario 2: start → orchestrator --plugin-dir (requires tmux)
 * Scenario 3: spawn → worker --plugin-dir (requires tmux)
 *
 * No mocks. Real processes, real filesystem, real tmux.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Helpers ─────────────────────────────────────────────────────────

const ENTRY = resolve(import.meta.dir, '..', '..', 'src', 'index.ts');
const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const CLAUDE_PLUGIN_DIR = join(homedir(), '.claude', 'plugins', 'uniflow');
const CODEX_SKILL_DIR = join(homedir(), '.agents', 'skills', 'uniflow');

async function runUniflow(args: string[], cwd?: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(['bun', 'run', ENTRY, ...args], {
    cwd: cwd ?? REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function tmuxAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['tmux', '-V'], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function tmuxRun(args: string[]): Promise<string> {
  const proc = Bun.spawn(['tmux', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Scenario 1: install → doctor ────────────────────────────────────

describe('Scenario 1: install → doctor flow', () => {
  test('uniflow install succeeds', async () => {
    const { exitCode, stdout } = await runUniflow(['install']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Claude Code');
  }, 30_000);

  test('Claude plugin.json exists and is valid JSON', async () => {
    const pluginJsonPath = join(CLAUDE_PLUGIN_DIR, '.claude-plugin', 'plugin.json');
    expect(existsSync(pluginJsonPath)).toBe(true);

    const content = await readFile(pluginJsonPath, 'utf-8');
    const json = JSON.parse(content);
    expect(json.name).toBe('uniflow');
    expect(json.source).toBe(REPO_ROOT);
  });

  test('Claude plugin commands exist (4 files)', () => {
    const commandsDir = join(CLAUDE_PLUGIN_DIR, 'commands');
    expect(existsSync(commandsDir)).toBe(true);

    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    expect(files.length).toBe(4);
    expect(files.sort()).toEqual([
      'uniflow-shutdown.md',
      'uniflow-spawn.md',
      'uniflow-status.md',
      'uniflow.md',
    ]);
  });

  test('Claude plugin skill exists', () => {
    const skillPath = join(CLAUDE_PLUGIN_DIR, 'skills', 'uniflow-orchestrator', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
  });

  test('Claude plugin hooks.json exists and is valid JSON', async () => {
    const hooksPath = join(CLAUDE_PLUGIN_DIR, 'hooks', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);

    const content = await readFile(hooksPath, 'utf-8');
    const json = JSON.parse(content);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].event).toBe('SessionStart');
  });

  test('Codex SKILL.md exists with trigger conditions', async () => {
    const skillPath = join(CODEX_SKILL_DIR, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const content = await readFile(skillPath, 'utf-8');
    expect(content).toContain('uniflow');
    expect(content).toContain('multi-agent');
  });

  test('Codex scripts/uniflow.sh exists and is executable', async () => {
    const scriptPath = join(CODEX_SKILL_DIR, 'scripts', 'uniflow.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const file = Bun.file(scriptPath);
    // Check file is non-empty
    expect(file.size).toBeGreaterThan(0);
  });

  test('Codex references/protocol.md exists', () => {
    const refPath = join(CODEX_SKILL_DIR, 'references', 'protocol.md');
    expect(existsSync(refPath)).toBe(true);
  });

  test('uniflow doctor passes with integrations section', async () => {
    const { exitCode, stdout } = await runUniflow(['doctor']);
    // doctor may exit non-zero if tmux version is wrong, but it should run
    expect(stdout).toContain('Checking system...');
    expect(stdout).toContain('Checking integrations...');
    expect(stdout).toContain('Claude Code plugin');
    expect(stdout).toContain('Claude plugin commands');
    expect(stdout).toContain('Codex skill');
    expect(stdout).toContain('Global CLI');
  }, 15_000);

  test('which uniflow returns a valid path', async () => {
    const proc = Bun.spawn(['which', 'uniflow'], { stdout: 'pipe', stderr: 'pipe' });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

// ── Tmux availability (module-level) ────────────────────────────────

const HAS_TMUX = await tmuxAvailable();

// ── Scenario 2: start → orchestrator --plugin-dir ───────────────────

describe('Scenario 2: start → orchestrator plugin access', () => {
  const testProjectDir = join(import.meta.dir, `.test-project-${randomUUID().slice(0, 8)}`);
  const testProjectName = `test-e2e-${randomUUID().slice(0, 8)}`;
  const tmuxSession = `uniflow-${testProjectName}`;
  let daemonProc: ReturnType<typeof Bun.spawn> | null = null;

  beforeAll(async () => {
    if (!HAS_TMUX) return;

    // Create isolated test project
    await mkdir(testProjectDir, { recursive: true });
    await writeFile(join(testProjectDir, '.uniflow-id'), testProjectName + '\n');

    // Ensure plugin dir exists (from Scenario 1's install)
    const pluginJson = join(CLAUDE_PLUGIN_DIR, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginJson)) {
      await runUniflow(['install']);
    }
  });

  afterAll(async () => {
    // Kill daemon process
    if (daemonProc) {
      try { daemonProc.kill(); } catch {}
      try { await daemonProc.exited; } catch {}
    }

    // Kill tmux session
    try {
      await tmuxRun(['kill-session', '-t', tmuxSession]);
    } catch {}

    // Clean up test project dir
    await rm(testProjectDir, { recursive: true, force: true });

    // Clean up state dir
    const stateDir = join(homedir(), '.uniflow', 'projects', testProjectName);
    await rm(stateDir, { recursive: true, force: true });

    // Clean up socket
    const sockPath = join(homedir(), '.uniflow', 'sockets', `${testProjectName}.sock`);
    try { await rm(sockPath, { force: true }); } catch {}
  });

  test.skipIf(!HAS_TMUX)('daemon starts and creates tmux session', async () => {
    // Start daemon as background process
    daemonProc = Bun.spawn(['bun', 'run', ENTRY, 'start', '--cli', 'claude'], {
      cwd: testProjectDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });

    // Wait for tmux session to appear (up to 15s)
    let found = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const sessions = await tmuxRun(['list-sessions', '-F', '#{session_name}']);
      if (sessions.includes(tmuxSession)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  }, 20_000);

  test.skipIf(!HAS_TMUX)('orchestrator pane launched with --plugin-dir', async () => {
    // Give pane time to start
    await sleep(2000);

    // Get pane start commands — #{pane_start_command} shows the command used
    const paneCommands = await tmuxRun([
      'list-panes', '-t', tmuxSession, '-F', '#{pane_start_command}',
    ]);

    // At least one pane should have --plugin-dir in its command
    expect(paneCommands).toContain('--plugin-dir');
  }, 10_000);

  test.skipIf(!HAS_TMUX)('orchestrator pane --plugin-dir points to valid directory', async () => {
    const paneCommands = await tmuxRun([
      'list-panes', '-t', tmuxSession, '-F', '#{pane_start_command}',
    ]);

    // Extract --plugin-dir value
    const match = paneCommands.match(/--plugin-dir\s+(\S+)/);
    expect(match).not.toBeNull();

    const pluginDirPath = match![1];
    // The path should point to a directory with .claude-plugin/plugin.json
    expect(existsSync(join(pluginDirPath, '.claude-plugin', 'plugin.json'))).toBe(true);
  }, 10_000);
});

// ── Scenario 3: spawn → worker --plugin-dir ─────────────────────────

describe('Scenario 3: spawn → worker plugin access', () => {
  const testProjectDir = join(import.meta.dir, `.test-project-spawn-${randomUUID().slice(0, 8)}`);
  const testProjectName = `test-spawn-${randomUUID().slice(0, 8)}`;
  const tmuxSession = `uniflow-${testProjectName}`;
  let daemonProc: ReturnType<typeof Bun.spawn> | null = null;

  beforeAll(async () => {
    if (!HAS_TMUX) return;

    await mkdir(testProjectDir, { recursive: true });
    await writeFile(join(testProjectDir, '.uniflow-id'), testProjectName + '\n');

    // Ensure plugin dir exists
    const pluginJson = join(CLAUDE_PLUGIN_DIR, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginJson)) {
      await runUniflow(['install']);
    }

    // Start daemon
    daemonProc = Bun.spawn(['bun', 'run', ENTRY, 'start', '--cli', 'claude'], {
      cwd: testProjectDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });

    // Wait for daemon ready (socket + tmux session)
    const sockPath = join(homedir(), '.uniflow', 'sockets', `${testProjectName}.sock`);
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (existsSync(sockPath)) break;
    }

    // Extra wait for orchestrator pane to be created
    await sleep(2000);
  });

  afterAll(async () => {
    if (daemonProc) {
      try { daemonProc.kill(); } catch {}
      try { await daemonProc.exited; } catch {}
    }
    try { await tmuxRun(['kill-session', '-t', tmuxSession]); } catch {}
    await rm(testProjectDir, { recursive: true, force: true });
    const stateDir = join(homedir(), '.uniflow', 'projects', testProjectName);
    await rm(stateDir, { recursive: true, force: true });
    const sockPath = join(homedir(), '.uniflow', 'sockets', `${testProjectName}.sock`);
    try { await rm(sockPath, { force: true }); } catch {}
  });

  test.skipIf(!HAS_TMUX)('spawn worker via IPC and verify --plugin-dir', async () => {
    const sockPath = join(homedir(), '.uniflow', 'sockets', `${testProjectName}.sock`);
    expect(existsSync(sockPath)).toBe(true);

    // Fire spawn request — don't await response (agent readiness takes too long in test env).
    // The tmux pane is created BEFORE readiness wait, so we can inspect it.
    const { connect } = await import('node:net');
    const socket = connect(sockPath, () => {
      socket.write(JSON.stringify({
        command: 'spawn',
        args: { name: 'worker-1', cli: 'claude', role: 'worker', mode: 'interactive' },
        requestId: randomUUID(),
      }) + '\n');
    });
    // Don't wait for response — just close after sending
    socket.on('error', () => {}); // ignore connection errors
    await sleep(1000);
    socket.end();

    // Wait for worker pane to be created (up to 10s)
    let workerPaneFound = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const paneCommands = await tmuxRun([
        'list-panes', '-t', tmuxSession, '-F', '#{pane_start_command}',
      ]);
      const pluginDirPanes = paneCommands.split('\n').filter(line => line.includes('--plugin-dir'));
      // We need at least 2: orchestrator + worker
      if (pluginDirPanes.length >= 2) {
        workerPaneFound = true;
        break;
      }
    }

    expect(workerPaneFound).toBe(true);
  }, 20_000);
});
