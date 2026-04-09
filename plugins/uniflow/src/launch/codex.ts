import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LaunchOptions } from './index.js';

/**
 * Build Codex launch command.
 *
 * Always uses interactive mode with permission bypass.
 * Codex `exec --ephemeral` exits immediately after one-shot execution,
 * which is incompatible with uniflow's persistent agent model.
 */
export function buildCodexCommand(_opts: LaunchOptions): string[] {
  const args: string[] = ['codex', '--dangerously-bypass-approvals-and-sandbox'];
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
