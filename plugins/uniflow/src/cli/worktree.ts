import { sendCommand } from './client.js';

export default async function worktree(args: string[]): Promise<void> {
  const subcommand = args[0];
  const agent = args[1];

  if (!subcommand || !agent) {
    console.error('Usage: uniflow worktree <create|merge> <agent>');
    process.exit(1);
  }

  if (subcommand === 'create') {
    const response = await sendCommand('worktree-create', { agent });
    if (response.success) {
      const data = response.data as { worktree: string };
      console.log(`Worktree created: ${data.worktree}`);
    } else {
      console.error(`Failed: ${response.error}`);
      process.exit(1);
    }
  } else if (subcommand === 'merge') {
    const response = await sendCommand('worktree-merge', { agent });
    if (response.success) {
      console.log(`Worktree merged for ${agent}.`);
    } else {
      console.error(`Failed: ${response.error}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown subcommand: ${subcommand}. Use "create" or "merge".`);
    process.exit(1);
  }
}
