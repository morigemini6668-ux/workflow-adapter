import { sendCommand } from "./client.js";

export default async function kill(args: string[]): Promise<void> {
  const agent = args[0];

  if (!agent) {
    console.error("Usage: uniflow kill <agent>");
    process.exit(1);
  }

  const response = await sendCommand("kill", { name: agent });

  if (response.success) {
    console.log(`Killed ${agent}.`);
  } else {
    console.error(`Failed to kill: ${response.error}`);
    process.exit(1);
  }
}
