#!/usr/bin/env bun
/**
 * copilot-exec.ts
 *
 * Thin wrapper around copilot-client.ts (ACP mode) for backward compatibility.
 * Runs copilot with a prompt file and returns the result.
 *
 * Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--timeout SECS]
 */

import { resolve } from "path";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write(
      "Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--timeout SECS]\n"
    );
    process.exit(1);
  }

  // Delegate to copilot-client.ts (ACP mode), passing all args through
  const clientScript = resolve(import.meta.dir, "copilot-client.ts");
  // Filter out --model args (no longer supported; uses user's copilot CLI default)
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model") { i++; continue; } // skip --model and its value
    filteredArgs.push(args[i]);
  }
  const proc = Bun.spawn(["bun", clientScript, ...filteredArgs], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: { ...process.env },
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

main();
