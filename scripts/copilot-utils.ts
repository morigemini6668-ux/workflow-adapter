/**
 * copilot-utils.ts
 *
 * Shared utilities for copilot CLI scripts.
 */

import { existsSync } from "fs";
import { join, resolve } from "path";
import { readFileSync } from "fs";

const DEFAULT_PORT_FILE = "copilot-server-port.conf";

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

/**
 * Read port number from the port configuration file.
 * Returns the port number, or null if the file doesn't exist.
 */
export function readPortFile(portFilePath?: string): number | null {
  const filePath = resolve(portFilePath ?? DEFAULT_PORT_FILE);
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, "utf-8").trim();
  const port = Number(content);
  if (isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }
  return port;
}

/**
 * Ping the copilot headless server via JSON-RPC.
 * Returns true if the server responds with "pong".
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
