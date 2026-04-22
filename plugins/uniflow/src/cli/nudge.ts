import { sendCommand } from "./client.js";

export default async function nudge(args: string[]): Promise<void> {
  const agent = args[0];

  if (!agent) {
    console.error("Usage: uniflow nudge <agent>");
    process.exit(1);
  }

  const response = await sendCommand("nudge", { name: agent });

  if (response.success) {
    console.log(`Nudged ${agent}.`);
  } else {
    console.error(`Failed to nudge: ${response.error}`);
    process.exit(1);
  }
}
