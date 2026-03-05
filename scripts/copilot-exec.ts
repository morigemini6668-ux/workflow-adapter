#!/usr/bin/env bun
/**
 * copilot-exec.ts
 *
 * Thin wrapper around copilot-client.ts --cli for backward compatibility.
 * Runs copilot with a prompt file and returns the result.
 *
 * Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--model MODEL] [--timeout SECS]
 */

import { resolve } from "path";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write(
      "Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--model MODEL] [--timeout SECS]\n"
    );
    process.exit(1);
  }

  // Delegate to copilot-client.ts --cli, passing all args through
  const clientScript = resolve(import.meta.dir, "copilot-client.ts");
  const proc = Bun.spawn(["bun", clientScript, "--cli", ...args], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: { ...process.env },
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

main();
