import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  UNIFLOW_HOME,
  UNIFLOW_SOCKETS_DIR,
  TMUX_MIN_VERSION,
  EXIT_TMUX_MISSING,
} from '../lib/constants.js';
import { findProjectRoot, readProjectName } from './init.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function whichCommand(cmd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'ignore' });
    const text = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? text.trim() : null;
  } catch {
    return null;
  }
}

async function getVersion(cmd: string, versionFlag = '--version'): Promise<string | null> {
  try {
    const proc = Bun.spawn([cmd, versionFlag], { stdout: 'pipe', stderr: 'pipe' });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    const output = stdout || stderr;
    const match = output.match(/(\d+\.\d+[\w.-]*)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function compareSemver(a: string, b: string): number {
  const parse = (s: string) => s.split('.').map(p => parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export default async function doctor(_args: string[]): Promise<void> {
  const checks: CheckResult[] = [];
  let hasCriticalFailure = false;

  // 1. tmux check
  const tmuxPath = await whichCommand('tmux');
  if (tmuxPath) {
    const version = await getVersion('tmux', '-V');
    if (version && compareSemver(version, TMUX_MIN_VERSION) >= 0) {
      checks.push({ name: 'tmux', ok: true, detail: `${version} (${tmuxPath})` });
    } else {
      checks.push({ name: 'tmux', ok: false, detail: `version ${version ?? 'unknown'} < ${TMUX_MIN_VERSION} required` });
      hasCriticalFailure = true;
    }
  } else {
    checks.push({ name: 'tmux', ok: false, detail: 'not found — install with: brew install tmux' });
    hasCriticalFailure = true;
  }

  // 2. Claude Code check
  const claudePath = await whichCommand('claude');
  if (claudePath) {
    const version = await getVersion('claude', '--version');
    checks.push({ name: 'claude', ok: true, detail: `${version ?? 'found'} (${claudePath})` });
  } else {
    checks.push({ name: 'claude', ok: false, detail: 'not found (optional — needed for Claude workers)' });
  }

  // 3. Codex check
  const codexPath = await whichCommand('codex');
  if (codexPath) {
    const version = await getVersion('codex', '--version');
    checks.push({ name: 'codex', ok: true, detail: `${version ?? 'found'} (${codexPath})` });
  } else {
    checks.push({ name: 'codex', ok: false, detail: 'not found (optional — needed for Codex workers)' });
  }

  // 4. State directory
  if (existsSync(UNIFLOW_HOME)) {
    checks.push({ name: '~/.uniflow/', ok: true, detail: 'exists' });
  } else {
    checks.push({ name: '~/.uniflow/', ok: false, detail: 'not found — run "uniflow init" first' });
  }

  // 5. Sockets directory
  if (existsSync(UNIFLOW_SOCKETS_DIR)) {
    checks.push({ name: 'sockets dir', ok: true, detail: 'exists' });
  } else {
    checks.push({ name: 'sockets dir', ok: false, detail: 'not found — will be created on first start' });
  }

  // 6. Project .uniflow-id
  const projectRoot = await findProjectRoot();
  if (projectRoot) {
    const name = await readProjectName(projectRoot);
    checks.push({ name: '.uniflow-id', ok: true, detail: `project: ${name}` });
  } else {
    checks.push({ name: '.uniflow-id', ok: false, detail: 'not found — run "uniflow init"' });
  }

  // Print system results
  console.log('Checking system...');
  for (const check of checks) {
    const icon = check.ok ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${check.name}: ${check.detail}`);
  }

  // 7. Integration checks
  const integrations: CheckResult[] = [];

  // 7a. Claude Code plugin
  const claudePluginJson = join(homedir(), '.claude', 'plugins', 'uniflow', '.claude-plugin', 'plugin.json');
  if (existsSync(claudePluginJson)) {
    try {
      const content = await readFile(claudePluginJson, 'utf-8');
      JSON.parse(content);
      integrations.push({ name: 'Claude Code plugin', ok: true, detail: 'installed' });
    } catch {
      integrations.push({ name: 'Claude Code plugin', ok: false, detail: 'plugin.json is invalid JSON' });
    }
  } else {
    integrations.push({ name: 'Claude Code plugin', ok: false, detail: 'not installed \u2014 run "uniflow install"' });
  }

  // 7b. Claude plugin commands
  const commandsDir = join(homedir(), '.claude', 'plugins', 'uniflow', 'commands');
  if (existsSync(commandsDir)) {
    try {
      const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
      if (files.length > 0) {
        integrations.push({ name: 'Claude plugin commands', ok: true, detail: `${files.length} commands found` });
      } else {
        integrations.push({ name: 'Claude plugin commands', ok: false, detail: 'no command files found' });
      }
    } catch {
      integrations.push({ name: 'Claude plugin commands', ok: false, detail: 'cannot read commands directory' });
    }
  } else {
    integrations.push({ name: 'Claude plugin commands', ok: false, detail: 'not installed \u2014 run "uniflow install"' });
  }

  // 7c. Codex skill
  const codexSkillPath = join(homedir(), '.agents', 'skills', 'uniflow', 'SKILL.md');
  if (existsSync(codexSkillPath)) {
    integrations.push({ name: 'Codex skill', ok: true, detail: 'installed' });
  } else {
    integrations.push({ name: 'Codex skill', ok: false, detail: 'not installed \u2014 run "uniflow install"' });
  }

  // 7d. Global CLI
  const uniflowPath = await whichCommand('uniflow');
  if (uniflowPath) {
    integrations.push({ name: 'Global CLI', ok: true, detail: uniflowPath });
  } else {
    integrations.push({ name: 'Global CLI', ok: false, detail: 'not in PATH \u2014 run "uniflow install" (includes bun link)' });
  }

  console.log('\nChecking integrations...');
  for (const check of integrations) {
    const icon = check.ok ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${check.name}: ${check.detail}`);
  }

  const allChecks = [...checks, ...integrations];
  const passed = allChecks.filter(c => c.ok).length;
  const total = allChecks.length;
  console.log(`\n${passed}/${total} checks passed.`);

  if (hasCriticalFailure) {
    console.error('\nCritical: tmux >= 3.3 is required.');
    process.exit(EXIT_TMUX_MISSING);
  }

  if (passed === total) {
    console.log('\nAll checks passed!');
  }
}
