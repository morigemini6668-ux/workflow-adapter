#!/usr/bin/env bun
/**
 * copilot-exec.ts
 *
 * Copilot CLI wrapper for workflow-adapter execute skills.
 * Runs copilot with a prompt file and returns the result.
 *
 * Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--model MODEL] [--timeout SECS]
 */

import { existsSync } from "fs";
import { join } from "path";

const DEFAULT_MODEL = "gpt-5.3-codex";
const DEFAULT_TIMEOUT = 600;

function printUsage(): void {
  process.stderr.write(
    "Usage: bun scripts/copilot-exec.ts --prompt-file <path> [--model MODEL] [--timeout SECS]\n"
  );
}

function parseArgs(args: string[]): {
  promptFile: string;
  model: string;
  timeout: number;
} {
  let promptFile = "";
  let model = DEFAULT_MODEL;
  let timeout = DEFAULT_TIMEOUT;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--prompt-file":
        promptFile = args[++i] ?? "";
        break;
      case "--model":
        model = args[++i] ?? DEFAULT_MODEL;
        break;
      case "--timeout": {
        const val = Number(args[++i]);
        if (isNaN(val) || val <= 0) {
          process.stderr.write(
            `[copilot-exec] ERROR: --timeout requires a positive number\n`
          );
          process.exit(1);
        }
        timeout = val;
        break;
      }
      default:
        process.stderr.write(
          `[copilot-exec] ERROR: Unknown argument: ${args[i]}\n`
        );
        printUsage();
        process.exit(1);
    }
  }

  return { promptFile, model, timeout };
}

/**
 * Find copilot CLI binary path.
 * Search order:
 *   1. $COPILOT_CLI_PATH env var
 *   2. PATH lookup (Bun.which)
 *   3. Platform-specific default locations
 */
function findCopilot(): string | null {
  // 1. Environment variable override
  const envPath = process.env.COPILOT_CLI_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // 2. PATH lookup
  const whichResult = Bun.which("copilot");
  if (whichResult) {
    return whichResult;
  }

  // 3. Platform-specific default locations
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      join(home, "Library", "Application Support", "copilotCli", "copilot")
    );
  } else if (process.platform === "win32") {
    const appData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    candidates.push(
      join(appData, "copilotCli", "copilot.exe"),
      join(appData, "Programs", "copilotCli", "copilot.exe")
    );
  } else {
    // Linux
    candidates.push(
      join(home, ".local", "bin", "copilot"),
      join(home, ".copilot", "bin", "copilot")
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { promptFile, model, timeout } = parseArgs(args);

  if (!promptFile) {
    process.stderr.write(
      `[copilot-exec] ERROR: --prompt-file is required\n`
    );
    printUsage();
    process.exit(1);
  }

  if (!existsSync(promptFile)) {
    process.stderr.write(
      `[copilot-exec] ERROR: prompt file not found: ${promptFile}\n`
    );
    process.exit(1);
  }

  // Find copilot binary
  const copilotBin = findCopilot();
  if (!copilotBin) {
    process.stderr.write(
      `[copilot-exec] ERROR: copilot CLI not found.\n` +
        `  Set COPILOT_CLI_PATH env var or install copilot CLI.\n`
    );
    process.exit(127);
  }

  // Read prompt content
  const promptContent = await Bun.file(promptFile).text();

  // Build command args
  const cmdArgs = [
    "-p",
    promptContent,
    "-s",
    "--allow-all-tools",
    "--autopilot",
    "--model",
    model,
    "--add-dir",
    process.cwd(),
  ];

  // Run copilot with timeout — inherit stdio so copilot writes directly
  let timedOut = false;
  const proc = Bun.spawn([copilotBin, ...cmdArgs], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: { ...process.env },
  });

  // Timeout handler
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeout * 1000);

  const exitCode = await proc.exited;
  clearTimeout(timer);

  // Handle timeout
  if (timedOut) {
    process.stderr.write(
      `[copilot-exec] ERROR: copilot CLI timed out after ${timeout}s\n`
    );
    process.exit(124);
  }

  if (exitCode !== 0) {
    process.stderr.write(
      `[copilot-exec] Hint: If auth error, try running: copilot auth login\n`
    );
  }

  process.exit(exitCode);
}

main();
