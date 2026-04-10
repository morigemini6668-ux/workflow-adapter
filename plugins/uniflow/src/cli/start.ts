import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { EXIT_SESSION_EXISTS } from "../lib/constants.js";
import type { CliType } from "../lib/types.js";
import { parseArgs } from "./client.js";
import { ensureInit } from "./init.js";

/**
 * Resolve the core uniflow plugin directory.
 * Dev mode: repo root has .claude-plugin/plugin.json → use repo root.
 * Install mode: ~/.claude/plugins/uniflow/ has plugin.json → use that.
 */
function resolveCorePluginDir(): string | undefined {
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

/**
 * Resolve all plugin directories: core uniflow + user plugins via --plugin flags.
 * Each user plugin path must contain .claude-plugin/plugin.json to be valid.
 */
function resolvePluginDirs(extraPluginPaths: string[]): string[] {
  const dirs: string[] = [];

  // Core uniflow plugin (always first if available)
  const coreDir = resolveCorePluginDir();
  if (coreDir) {
    dirs.push(coreDir);
  }

  // User plugins from --plugin flags
  for (const p of extraPluginPaths) {
    const resolved = resolve(p);
    if (existsSync(join(resolved, ".claude-plugin", "plugin.json"))) {
      dirs.push(resolved);
    } else {
      console.warn(
        `Warning: Plugin directory not valid (missing .claude-plugin/plugin.json): ${resolved}`,
      );
    }
  }

  return dirs;
}

export default async function start(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const cli = (flags.cli as CliType) ?? "claude";
  const tui = flags["no-tui"] !== true;
  const here = flags.here === true;

  // Collect --plugin flags from raw args (parseArgs doesn't handle repeated flags)
  const extraPlugins: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--plugin" && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      extraPlugins.push(args[i + 1]);
      i++; // skip value
    }
  }

  // Auto-init if needed
  const { root } = await ensureInit();

  // Resolve plugin directories (core + user plugins)
  const pluginDirs = resolvePluginDirs(extraPlugins);

  // Dynamically import daemon to avoid loading heavy deps for other commands
  const { startDaemon } = await import("../daemon/index.js");

  try {
    const handle = await startDaemon({
      cwd: root,
      orchestratorCli: cli,
      tui,
      here,
      pluginDirs,
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
