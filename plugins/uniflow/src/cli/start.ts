import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { EXIT_SESSION_EXISTS } from "../lib/constants.js";
import type { CliType } from "../lib/types.js";
import { parseArgs } from "./client.js";
import { ensureInit } from "./init.js";

/**
 * Resolve the uniflow plugin directory for --plugin-dir.
 * Dev mode: repo root has .claude-plugin/plugin.json → use repo root.
 * Install mode: ~/.claude/plugins/uniflow/ has plugin.json → use that.
 */
function resolvePluginDir(): string | undefined {
  // Dev mode: navigate from src/cli/ up to repo root
  const repoRoot = resolve(import.meta.dir, "..", "..");
  if (existsSync(join(repoRoot, ".claude-plugin", "plugin.json"))) {
    return repoRoot;
  }

  // Install mode: check installed plugin location
  const installedDir = join(homedir(), ".claude", "plugins", "uniflow");
  if (existsSync(join(installedDir, ".claude-plugin", "plugin.json"))) {
    return installedDir;
  }

  return undefined;
}

export default async function start(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const cli = (flags.cli as CliType) ?? "claude";
  const tui = flags["no-tui"] !== true;
  const here = flags.here === true;

  // Auto-init if needed
  const { root } = await ensureInit();

  // Resolve plugin directory
  const pluginDir = resolvePluginDir();

  // Dynamically import daemon to avoid loading heavy deps for other commands
  const { startDaemon } = await import("../daemon/index.js");

  try {
    const handle = await startDaemon({
      cwd: root,
      orchestratorCli: cli,
      tui,
      here,
      pluginDir,
    });

    if (here) {
      console.log("Session started in current tmux window.");
    } else {
      console.log("Session started. Attach with: uniflow attach");
    }
    console.log("Status: uniflow status");

    // Keep daemon running until signal
    const shutdown = async () => {
      console.log("\nShutting down...");
      await handle.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Block forever (daemon runs in event loop)
    await new Promise(() => {
      /* intentionally never resolves */
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Session already active")) {
      console.error(`Error: ${err.message}`);
      console.error('Use "uniflow attach" to reconnect or "uniflow stop" first.');
      process.exit(EXIT_SESSION_EXISTS);
    }
    throw err;
  }
}
