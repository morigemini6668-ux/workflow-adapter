import { ensureInit } from './init.js';
import { EXIT_SESSION_EXISTS } from '../lib/constants.js';
import type { CliType } from '../lib/types.js';
import { parseArgs } from './client.js';

export default async function start(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const cli = (flags.cli as CliType) ?? 'claude';
  const tui = flags.tui === true;

  // Auto-init if needed
  const { root } = await ensureInit();

  // Dynamically import daemon to avoid loading heavy deps for other commands
  const { startDaemon } = await import('../daemon/index.js');

  try {
    const handle = await startDaemon({
      cwd: root,
      orchestratorCli: cli,
      tui,
    });

    console.log(`Session started. Attach with: uniflow attach`);
    console.log(`Status: uniflow status`);

    // Keep daemon running until signal
    const shutdown = async () => {
      console.log('\nShutting down...');
      await handle.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Block forever (daemon runs in event loop)
    await new Promise(() => {});
  } catch (err) {
    if (err instanceof Error && err.message.includes('Session already active')) {
      console.error(`Error: ${err.message}`);
      console.error('Use "uniflow attach" to reconnect or "uniflow stop" first.');
      process.exit(EXIT_SESSION_EXISTS);
    }
    throw err;
  }
}
