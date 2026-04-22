import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, sendCommand } from "./client.js";

export default async function spawn(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(
      "Usage: uniflow spawn <name> [--cli claude|codex] [--role executor] [--role-file <path>] [--mode interactive|non_interactive] [--worktree]",
    );
    process.exit(1);
  }

  // --role-file: resolve to absolute path, validate existence
  let roleFile: string | undefined;
  const rawRoleFile = flags["role-file"];
  if (rawRoleFile !== undefined) {
    if (typeof rawRoleFile !== "string") {
      console.error("Usage: --role-file requires a file path argument");
      process.exit(1);
    }
    roleFile = resolve(rawRoleFile);
    if (!existsSync(roleFile)) {
      console.error(`Role file not found: ${roleFile}`);
      process.exit(1);
    }
  }

  const response = await sendCommand("spawn", {
    name,
    cli: flags.cli ?? "claude",
    role: flags.role ?? "executor",
    mode: flags.mode ?? "interactive",
    worktree: flags.worktree === true,
    ...(roleFile ? { roleFile } : {}),
  });

  if (response.success) {
    console.log(`Spawned agent: ${name}`);
  } else {
    console.error(`Failed to spawn: ${response.error}`);
    process.exit(1);
  }
}
