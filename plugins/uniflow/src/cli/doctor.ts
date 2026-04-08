import { existsSync } from 'node:fs';
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

  // Print results
  console.log('Checking system...');
  for (const check of checks) {
    const icon = check.ok ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${check.name}: ${check.detail}`);
  }

  const passed = checks.filter(c => c.ok).length;
  const total = checks.length;
  console.log(`\n${passed}/${total} checks passed.`);

  if (hasCriticalFailure) {
    console.error('\nCritical: tmux >= 3.3 is required.');
    process.exit(EXIT_TMUX_MISSING);
  }

  if (passed === total) {
    console.log('\nAll checks passed!');
  }
}
