import { sendCommand } from './client.js';
import { EXIT_AGENT_NOT_FOUND } from '../lib/constants.js';

export default async function assign(args: string[]): Promise<void> {
  const taskId = args[0];
  const agent = args[1];

  if (!taskId || !agent) {
    console.error('Usage: uniflow assign <task-id> <agent>');
    process.exit(1);
  }

  const response = await sendCommand('assign', { taskId, agent });

  if (response.success) {
    console.log(`Task ${taskId} assigned to ${agent}.`);
  } else {
    console.error(`Failed to assign: ${response.error}`);
    process.exit(response.error?.includes('Agent not found') ? EXIT_AGENT_NOT_FOUND : 1);
  }
}
