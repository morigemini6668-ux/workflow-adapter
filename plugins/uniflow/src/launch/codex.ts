import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchOptions } from "./index.js";

/**
 * Build Codex launch command.
 *
 * Always uses interactive mode with permission bypass.
 * Codex `exec --ephemeral` exits immediately after one-shot execution,
 * which is incompatible with uniflow's persistent agent model.
 */
export function buildCodexCommand(_opts: LaunchOptions): string[] {
  const args: string[] = ["codex", "--dangerously-bypass-approvals-and-sandbox"];
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
 *
 * Codex reads AGENTS.md from cwd automatically — there is no CLI flag for
 * instruction file injection. We write a session-scoped AGENTS.md to the
 * worker's cwd, backing up any existing file for restore on session end.
 *
 * Limitation: multiple Codex workers sharing the same cwd will overwrite
 * each other's AGENTS.md. Use --worktree to give each worker its own cwd.
 */
export async function prepareCodex(opts: LaunchOptions): Promise<void> {
  const instructionContent = await Bun.file(opts.instructionPath).text();
  const agentsMdPath = join(opts.cwd, "AGENTS.md");

  // Backup existing AGENTS.md if present and not already backed up
  const backupPath = join(opts.cwd, "AGENTS.md.uniflow-backup");
  const existing = Bun.file(agentsMdPath);
  const backupExists = await Bun.file(backupPath).exists();
  if ((await existing.exists()) && !backupExists) {
    await writeFile(backupPath, await existing.text());
  }

  // Write instructions + uniflow section
  const content = instructionContent.includes("uniflow")
    ? instructionContent
    : instructionContent + UNIFLOW_AGENTS_SECTION;
  await writeFile(agentsMdPath, content);
}
