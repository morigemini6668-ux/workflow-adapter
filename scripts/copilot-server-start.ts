#!/usr/bin/env bun
/**
 * copilot-server-start.ts
 *
 * Legacy compatibility stub.
 * The ACP-based client no longer needs a persistent server.
 * This script validates that copilot CLI is available.
 *
 * Usage: bun scripts/copilot-server-start.ts [--session NAME] [--model MODEL]
 */

import { findCopilot } from "./copilot-utils";

async function main(): Promise<void> {
  const copilotBin = findCopilot();
  if (!copilotBin) {
    process.stderr.write(
      "[copilot-server] ERROR: copilot CLI not found.\n" +
      "  Set COPILOT_CLI_PATH env var or install copilot CLI.\n"
    );
    process.exit(127);
  }

  process.stderr.write(
    "[copilot-server] NOTE: Persistent server is no longer needed.\n" +
    "[copilot-server] The client now uses ACP mode (--acp --stdio) per request.\n" +
    "[copilot-server] Copilot CLI is available at: " + copilotBin + "\n"
  );
}

main();
