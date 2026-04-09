import { sendCommand } from "./client.js";

export default async function respawn(args: string[]): Promise<void> {
  const agent = args[0];

  if (!agent) {
    console.error("Usage: uniflow respawn <agent>");
    process.exit(1);
  }

  const response = await sendCommand("respawn", { name: agent });

  if (response.success) {
    console.log(`Respawned ${agent}.`);
  } else {
    console.error(`Failed to respawn: ${response.error}`);
    process.exit(1);
  }
}
