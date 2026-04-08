import { randomUUID } from 'node:crypto';
import { sendCommand, parseArgs } from './client.js';

export default async function taskAdd(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const subject = positional.join(' ');

  if (!subject) {
    console.error('Usage: uniflow task-add <subject> [--assign agent] [--priority 1-5] [--depends-on id,id]');
    process.exit(1);
  }

  const taskId = `task-${randomUUID().slice(0, 8)}`;
  const priority = flags.priority ? Number(flags.priority) : 3;
  const dependsOn = flags['depends-on']
    ? String(flags['depends-on']).split(',').map(s => s.trim())
    : [];

  // Create task via a custom protocol — daemon writes the task file
  const response = await sendCommand('task-create', {
    id: taskId,
    subject,
    description: subject,
    priority,
    depends_on: dependsOn,
    assignee: flags.assign ? String(flags.assign) : null,
  });

  if (response.success) {
    console.log(`Task created: ${taskId}`);
    if (flags.assign) {
      // Auto-assign if --assign provided
      const assignResponse = await sendCommand('assign', {
        taskId,
        agent: String(flags.assign),
      });
      if (assignResponse.success) {
        console.log(`Assigned to: ${flags.assign}`);
      } else {
        console.error(`Warning: assign failed: ${assignResponse.error}`);
      }
    }
  } else {
    console.error(`Failed to create task: ${response.error}`);
    process.exit(1);
  }
}
