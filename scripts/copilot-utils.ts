/**
 * copilot-utils.ts
 *
 * Shared utilities for copilot CLI scripts.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { readFileSync, readdirSync } from "fs";
import { randomBytes } from "crypto";

const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
const CONFIG_DIR = join(home, ".claude", "workflow-adapter");

/**
 * Ensure the config directory exists and return its path.
 */
export function configDir(): string {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_DIR;
}

/**
 * Generate a short random session ID (6 hex chars).
 */
export function generateSessionId(): string {
  return randomBytes(3).toString("hex");
}

/**
 * Get the log file path for a given session.
 */
export function logFilePath(session: string): string {
  return join(configDir(), `copilot-server.${session}.log`);
}

/**
 * Find copilot CLI binary path.
 * Search order:
 *   1. $COPILOT_CLI_PATH env var
 *   2. PATH lookup (Bun.which)
 *   3. Platform-specific default locations
 */
export function findCopilot(): string | null {
  const envPath = process.env.COPILOT_CLI_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const whichResult = Bun.which("copilot");
  if (whichResult) {
    return whichResult;
  }

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

// --- Legacy port-file helpers (kept for backward compat with server-stop) ---

/**
 * Get the port file path for a given session.
 */
export function portFilePath(session?: string): string {
  const dir = configDir();
  if (session) {
    return join(dir, `copilot-server-port.${session}.conf`);
  }
  return join(dir, "copilot-server-port.*.conf");
}

/**
 * Find all active session port files.
 */
export function findSessions(): Array<{ session: string; portFile: string }> {
  const dir = configDir();
  try {
    const files = readdirSync(dir);
    return files
      .filter((f) => f.startsWith("copilot-server-port.") && f.endsWith(".conf"))
      .map((f) => {
        const session = f.replace("copilot-server-port.", "").replace(".conf", "");
        return { session, portFile: join(dir, f) };
      });
  } catch {
    return [];
  }
}

/**
 * Read port number from the port configuration file.
 */
export function readPortFile(session?: string): number | null {
  if (session) {
    const filePath = portFilePath(session);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8").trim();
    const port = Number(content);
    return isNaN(port) || port <= 0 || port > 65535 ? null : port;
  }

  const sessions = findSessions();
  if (sessions.length === 0) return null;
  if (sessions.length === 1) {
    const content = readFileSync(sessions[0].portFile, "utf-8").trim();
    const port = Number(content);
    return isNaN(port) || port <= 0 || port > 65535 ? null : port;
  }

  process.stderr.write(
    `[copilot] Multiple sessions found. Specify --session:\n` +
    sessions.map((s) => `  --session ${s.session}`).join("\n") + "\n"
  );
  return null;
}

/**
 * Ping the copilot headless server via JSON-RPC (legacy).
 */
export async function pingServer(port: number, timeoutMs = 5000): Promise<boolean> {
  const net = await import("net");
  const payload = JSON.stringify({ jsonrpc: "2.0", method: "ping", params: {}, id: 1 });
  const payloadBytes = Buffer.from(payload, "utf-8");
  const header = `Content-Length: ${payloadBytes.length}\r\n\r\n`;

  for (const host of ["::1", "127.0.0.1"]) {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.write(header + payload);
        });
        let buf = "";
        const timer = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, timeoutMs);
        socket.on("data", (chunk) => {
          buf += chunk.toString("utf-8");
          if (buf.includes('"pong"')) {
            clearTimeout(timer);
            socket.destroy();
            resolve(true);
          }
        });
        socket.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
      });
      if (result) return true;
    } catch {
      continue;
    }
  }
  return false;
}
