#!/usr/bin/env bun
/**
 * copilot-server-stop.ts
 *
 * Stop the Copilot CLI headless server.
 *
 * Usage: bun scripts/copilot-server-stop.ts [--session NAME] [--all]
 */

import { unlinkSync } from "fs";
import { readPortFile, findSessions, portFilePath, logFilePath } from "./copilot-utils";

async function stopSession(session: string): Promise<void> {
  const port = readPortFile(session);
  const pFile = portFilePath(session);

  if (port === null) {
    process.stderr.write(`[copilot-server] Session '${session}' is not running (no port file)\n`);
    return;
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
      process.stderr.write(`[copilot-server] Stopped session '${session}' on port ${port} (PID: ${pids.join(", ")})\n`);
    } else {
      process.stderr.write(`[copilot-server] No process found for session '${session}' on port ${port}\n`);
    }
  } catch {
    process.stderr.write(`[copilot-server] Warning: Could not check for process on port ${port}\n`);
  }

  // Remove port file
  try {
    unlinkSync(pFile);
  } catch {}
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let session = "";
  let stopAll = false;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--session":
        session = argv[++i] ?? "";
        break;
      case "--all":
        stopAll = true;
        break;
      default:
        process.stderr.write(`[copilot-server] ERROR: Unknown argument: ${argv[i]}\n`);
        process.exit(1);
    }
  }

  if (stopAll) {
    const sessions = findSessions();
    if (sessions.length === 0) {
      process.stderr.write("[copilot-server] No active sessions found\n");
      return;
    }
    for (const s of sessions) {
      await stopSession(s.session);
    }
    return;
  }

  if (!session) {
    // Try to find a single session
    const sessions = findSessions();
    if (sessions.length === 0) {
      process.stderr.write("[copilot-server] No active sessions found\n");
      process.exit(0);
    }
    if (sessions.length === 1) {
      session = sessions[0].session;
    } else {
      process.stderr.write(
        `[copilot-server] Multiple sessions found. Specify --session or use --all:\n` +
        sessions.map((s) => `  --session ${s.session}`).join("\n") + "\n" +
        "  --all (stop all sessions)\n"
      );
      process.exit(1);
    }
  }

  await stopSession(session);
}

main();
