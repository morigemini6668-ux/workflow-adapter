import { sendCommand, parseArgs } from './client.js';

export default async function spawn(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error('Usage: uniflow spawn <name> [--cli claude|codex] [--role executor] [--mode interactive|non_interactive] [--worktree]');
    process.exit(1);
  }

  const response = await sendCommand('spawn', {
    name,
    cli: flags.cli ?? 'claude',
    role: flags.role ?? 'executor',
    mode: flags.mode ?? 'interactive',
    worktree: flags.worktree === true,
  });

  if (response.success) {
    console.log(`Spawned agent: ${name}`);
  } else {
    console.error(`Failed to spawn: ${response.error}`);
    process.exit(1);
  }
}
