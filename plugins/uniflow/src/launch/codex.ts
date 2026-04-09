import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LaunchOptions } from './index.js';

/**
 * Build Codex launch command.
 *
 * Interactive mode: codex --dangerously-bypass-approvals-and-sandbox
 * Non-interactive mode: codex exec --ephemeral "prompt"
 */
export function buildCodexCommand(opts: LaunchOptions): string[] {
  const args: string[] = ['codex'];

  if (opts.mode === 'non_interactive') {
    // Headless: exec --ephemeral
    args.push('exec', '--ephemeral');
    if (opts.initialPrompt) {
      args.push(opts.initialPrompt);
    }
  } else {
    // Interactive: full TUI with permission bypass
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }

  return args;
}

const UNIFLOW_AGENTS_SECTION = `

## uniflow Integration

- Use \`uniflow\` CLI to orchestrate multi-agent workflows via tmux
- State directory: ~/.uniflow/
- To spawn agents: \`uniflow spawn <name>\`
- Run \`uniflow --help\` for available commands
`;

/**
 * Prepare Codex launch environment.
 * - Write AGENTS.md to the worker's working directory
 * - Append uniflow section for CLI awareness
 */
export async function prepareCodex(opts: LaunchOptions): Promise<void> {
  // Codex reads AGENTS.md from cwd automatically.
  // Read the rendered instruction content and write as AGENTS.md.
  const instructionContent = await Bun.file(opts.instructionPath).text();
  const agentsMdPath = join(opts.cwd, 'AGENTS.md');

  // Backup existing AGENTS.md if present
  const existing = Bun.file(agentsMdPath);
  if (await existing.exists()) {
    const backupPath = join(opts.cwd, 'AGENTS.md.uniflow-backup');
    await writeFile(backupPath, await existing.text());
  }

  // Write instructions + uniflow section
  const content = instructionContent.includes('uniflow')
    ? instructionContent
    : instructionContent + UNIFLOW_AGENTS_SECTION;
  await writeFile(agentsMdPath, content);
}
