#!/usr/bin/env bun
/**
 * copilot-server-start.ts
 *
 * Start the Copilot CLI headless server.
 *
 * Usage: bun scripts/copilot-server-start.ts [--port PORT] [--session NAME] [--model MODEL] [--mode readonly|edit|full]
 */

import { writeFileSync, unlinkSync } from "fs";
import { findCopilot, readPortFile, pingServer, generateSessionId, portFilePath, logFilePath } from "./copilot-utils";

const DEFAULT_PORT = 4321;
const PING_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 1_000;

function parseArgs(argv: string[]): { port: number; session: string; model?: string; mode?: string } {
  let port = DEFAULT_PORT;
  let session = "";
  let model: string | undefined;
  let mode: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--port": {
        const val = Number(argv[++i]);
        if (isNaN(val) || val <= 0 || val > 65535) {
          process.stderr.write("[copilot-server] ERROR: --port requires a valid port number\n");
          process.exit(1);
        }
        port = val;
        break;
      }
      case "--session":
        session = argv[++i] ?? "";
        break;
      case "--model":
        model = argv[++i];
        break;
      case "--mode":
        mode = argv[++i];
        if (mode && !["readonly", "edit", "full"].includes(mode)) {
          process.stderr.write("[copilot-server] ERROR: --mode must be readonly, edit, or full\n");
          process.exit(1);
        }
        break;
      default:
        process.stderr.write(`[copilot-server] ERROR: Unknown argument: ${argv[i]}\n`);
        process.exit(1);
    }
  }

  if (!session) {
    session = generateSessionId();
  }

  return { port, session, model, mode };
}

async function main(): Promise<void> {
  const { port, session, model, mode } = parseArgs(process.argv.slice(2));
  const pFile = portFilePath(session);
  const lFile = logFilePath(session);

  // Check if this session is already running
  const existingPort = readPortFile(session);
  if (existingPort !== null) {
    const alive = await pingServer(existingPort);
    if (alive) {
      process.stderr.write(`[copilot-server] Session '${session}' already running on port ${existingPort}\n`);
      process.exit(0);
    }
    // Stale port file, clean up
    unlinkSync(pFile);
  }

  const copilotBin = findCopilot();
  if (!copilotBin) {
    process.stderr.write(
      "[copilot-server] ERROR: copilot CLI not found.\n" +
      "  Set COPILOT_CLI_PATH env var or install copilot CLI.\n"
    );
    process.exit(127);
  }

  // Build command
  const cmdArgs = ["--headless", "--port", String(port), "--allow-all"];
  if (model) cmdArgs.push("--model", model);

  // Start server process
  const logFile = Bun.file(lFile).writer();

  const proc = Bun.spawn([copilotBin, ...cmdArgs], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env },
  });

  // Log stdout/stderr to file in background
  const pipeToLog = async (stream: ReadableStream<Uint8Array> | null, prefix: string) => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        logFile.write(`${prefix}${text}`);
        logFile.flush();
      }
    } catch {}
  };
  pipeToLog(proc.stdout as ReadableStream<Uint8Array>, "");
  pipeToLog(proc.stderr as ReadableStream<Uint8Array>, "[stderr] ");

  // Write port file
  writeFileSync(pFile, String(port));

  // Wait for server to become ready (ping with retries)
  const startTime = Date.now();
  let ready = false;
  while (Date.now() - startTime < PING_TIMEOUT_MS) {
    ready = await pingServer(port, 2000);
    if (ready) break;
    await Bun.sleep(PING_INTERVAL_MS);
  }

  if (ready) {
    process.stderr.write(`[copilot-server] Session '${session}' started on port ${port}\n`);
    process.stderr.write(`[copilot-server] Log: ${lFile}\n`);
    process.stderr.write(`[copilot-server] Connect with: --session ${session}\n`);
  } else {
    process.stderr.write("[copilot-server] ERROR: Server failed to respond within timeout\n");
    process.stderr.write(`[copilot-server] Check logs: ${lFile}\n`);
    proc.kill();
    unlinkSync(pFile);
    process.exit(1);
  }

  proc.unref();
}

main();
