import { sendCommand, parseArgs } from './client.js';
import { EXIT_AGENT_NOT_FOUND } from '../lib/constants.js';

export default async function send(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const agent = positional[0];
  const message = positional.slice(1).join(' ');

  if (!agent || !message) {
    console.error('Usage: uniflow send <agent> <message> [--interrupt|--nudge]');
    process.exit(1);
  }

  const mode = flags.interrupt === true ? 'interrupt' : 'nudge';

  const response = await sendCommand('send', { agent, message, mode });

  if (response.success) {
    console.log(`Message sent to ${agent} (${mode}).`);
  } else {
    console.error(`Failed to send: ${response.error}`);
    process.exit(response.error?.includes('Agent not found') ? EXIT_AGENT_NOT_FOUND : 1);
  }
}
