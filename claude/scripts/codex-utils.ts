/**
 * codex-utils.ts
 *
 * Shared utilities for Codex CLI scripts.
 */

import { existsSync } from "fs";
import { join } from "path";

const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

/**
 * Find codex CLI binary path.
 * Search order:
 *   1. $CODEX_CLI_PATH env var
 *   2. PATH lookup (Bun.which)
 *   3. Platform-specific default locations
 */
export function findCodex(): string | null {
  const envPath = process.env.CODEX_CLI_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const whichResult = Bun.which("codex");
  if (whichResult) {
    return whichResult;
  }

  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      join(home, ".local", "bin", "codex"),
    );
  } else if (process.platform === "win32") {
    const appData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    candidates.push(
      join(appData, "codex", "codex.exe"),
      join(appData, "Programs", "codex", "codex.exe"),
    );
  } else {
    candidates.push(
      join(home, ".local", "bin", "codex"),
      "/usr/local/bin/codex",
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
