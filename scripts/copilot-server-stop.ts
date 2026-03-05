#!/usr/bin/env bun
/**
 * copilot-server-stop.ts
 *
 * Stop the Copilot CLI headless server.
 *
 * Usage: bun scripts/copilot-server-stop.ts
 */

import { resolve } from "path";
import { unlinkSync } from "fs";
import { readPortFile } from "./copilot-utils";

const PORT_FILE = "copilot-server-port.conf";

async function main(): Promise<void> {
  const port = readPortFile(PORT_FILE);
  if (port === null) {
    process.stderr.write("[copilot-server] Server is not running (no port file found)\n");
    process.exit(0);
  }

  // Find and kill the process listening on the port
  try {
    const lsof = Bun.spawn(["lsof", "-ti", `:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(lsof.stdout).text();
    const exitCode = await lsof.exited;

    if (exitCode === 0 && output.trim()) {
      const pids = output.trim().split("\n").map((p) => p.trim()).filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {}
      }
      process.stderr.write(`[copilot-server] Stopped server on port ${port} (PID: ${pids.join(", ")})\n`);
    } else {
      process.stderr.write(`[copilot-server] No process found on port ${port}\n`);
    }
  } catch {
    process.stderr.write(`[copilot-server] Warning: Could not check for process on port ${port}\n`);
  }

  // Remove port file
  try {
    unlinkSync(resolve(PORT_FILE));
    process.stderr.write(`[copilot-server] Removed ${PORT_FILE}\n`);
  } catch {}
}

main();
