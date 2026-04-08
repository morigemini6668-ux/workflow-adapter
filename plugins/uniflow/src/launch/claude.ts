import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { LaunchOptions } from './index.js';

/**
 * Build Claude Code launch command.
 *
 * Interactive mode: claude --dangerously-skip-permissions --append-system-prompt-file ... --name ...
 * Non-interactive mode: claude -p --bare --dangerously-skip-permissions --append-system-prompt-file ...
 */
export function buildClaudeCommand(opts: LaunchOptions): string[] {
  const args: string[] = ['claude'];

  if (opts.mode === 'non_interactive') {
    // Headless: -p (pipe) + --bare (no TUI chrome)
    args.push('-p', '--bare');
  }

  // Permission bypass (always)
  args.push('--dangerously-skip-permissions');

  // Instruction injection via system prompt file
  args.push('--append-system-prompt-file', opts.instructionPath);

  // Plugin directory for uniflow CLI in PATH + hooks
  if (opts.pluginDir) {
    args.push('--plugin-dir', opts.pluginDir);
  }

  // Session name for identification
  args.push('--name', `uniflow-${opts.name}`);

  // Initial prompt (interactive mode: passed as argument)
  if (opts.initialPrompt && opts.mode === 'non_interactive') {
    args.push(opts.initialPrompt);
  }

  return args;
}

/**
 * Prepare Claude Code launch environment.
 * - Pre-trust the working directory to skip the trust prompt
 */
export async function prepareClaude(opts: LaunchOptions): Promise<void> {
  // Pre-trust directory: create ~/.claude/projects/{encoded-path}/
  // This prevents Claude from showing the "Trust this folder?" prompt
  const encodedPath = encodeTrustPath(opts.cwd);
  const trustDir = join(homedir(), '.claude', 'projects', encodedPath);
  await mkdir(trustDir, { recursive: true });
}

/**
 * Encode a directory path for Claude Code's trust directory structure.
 * Replaces path separators with dashes, prefixed with dash.
 * e.g., /Users/foo/project → -Users-foo-project
 */
function encodeTrustPath(dirPath: string): string {
  const resolved = resolve(dirPath);
  return resolved.replace(/\//g, '-');
}
