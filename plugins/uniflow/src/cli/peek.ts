import { EXIT_AGENT_NOT_FOUND } from "../lib/constants.js";
import { sendCommand } from "./client.js";

export default async function peek(args: string[]): Promise<void> {
  const agent = args[0];

  if (!agent) {
    console.error("Usage: uniflow peek <agent>");
    process.exit(1);
  }

  const response = await sendCommand("peek", { name: agent });

  if (!response.success) {
    console.error(`Error: ${response.error}`);
    process.exit(response.error?.includes("Agent not found") ? EXIT_AGENT_NOT_FOUND : 1);
  }

  const data = response.data as { output: string };
  console.log(`--- ${agent} pane ---`);
  console.log(data.output);
  console.log("--- end ---");
}
