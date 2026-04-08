import { sendCommand, parseArgs } from './client.js';
import { EXIT_AGENT_NOT_FOUND } from '../lib/constants.js';

/** Strip ANSI escape sequences and control characters from a string */
function stripAnsi(str: string): string {
  return str
    .replace(/\x1B(?:\[[?]?[0-9;]*[A-Za-z]|\][^\x07]*\x07|\([A-Z])/g, '')
    .replace(/\r/g, '');
}

export default async function logs(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const agent = positional[0];

  if (!agent) {
    console.error('Usage: uniflow logs <agent> [-n lines] [--follow] [--raw]');
    process.exit(1);
  }

  const lines = flags.n ? Number(flags.n) : 50;
  const follow = flags.follow === true;
  const raw = flags.raw === true;

  const printLogs = async () => {
    const response = await sendCommand('logs', { name: agent, lines });

    if (!response.success) {
      console.error(`Error: ${response.error}`);
      process.exit(response.error?.includes('Agent not found') ? EXIT_AGENT_NOT_FOUND : 1);
    }

    const data = response.data as { logs: string };
    console.log(raw ? data.logs : stripAnsi(data.logs));
  };

  if (follow) {
    while (true) {
      console.clear();
      await printLogs();
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    await printLogs();
  }
}
