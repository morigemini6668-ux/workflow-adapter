import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";
import { socketPath } from "../lib/constants.js";
import type { DaemonRequest, DaemonResponse } from "../lib/types.js";
import { findProjectRoot, readProjectName } from "./init.js";

/**
 * Send a request to the daemon via Unix domain socket.
 * Resolves project name from .uniflow-id automatically.
 */
export async function sendRequest(request: DaemonRequest): Promise<DaemonResponse> {
  const root = await findProjectRoot();
  if (!root) {
    throw new Error('Not in a uniflow project. Run "uniflow init" first.');
  }
  const project = await readProjectName(root);
  const sock = socketPath(project);
  return sendToSocket(sock, request);
}

/**
 * Send a command to the daemon (convenience wrapper).
 */
export async function sendCommand(
  command: string,
  args: Record<string, unknown> = {},
): Promise<DaemonResponse> {
  return sendRequest({
    command,
    args,
    requestId: randomUUID(),
  });
}

/**
 * Low-level: send a DaemonRequest to a specific socket path.
 */
function sendToSocket(sock: string, request: DaemonRequest): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    let data = "";

    const socket: Socket = connect(sock, () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      data += chunk.toString();
      // Try to parse each newline-delimited response
      const lines = data.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line) as DaemonResponse;
          socket.end();
          resolve(response);
          return;
        } catch {
          // Incomplete JSON, keep buffering
        }
      }
    });

    socket.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error('Daemon not running. Start with "uniflow start".'));
      } else if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
        reject(new Error('Daemon not responding. Try "uniflow start" to restart.'));
      } else {
        reject(err);
      }
    });

    socket.on("end", () => {
      if (!data.trim()) {
        reject(new Error("Daemon closed connection without response."));
      }
    });

    // Timeout after 30 seconds
    socket.setTimeout(30_000, () => {
      socket.destroy();
      reject(new Error("Daemon request timed out."));
    });
  });
}

/**
 * Parse CLI arguments into a key-value map.
 * Handles: --key value, --key=value, --flag (boolean true), positional args.
 */
export function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 0) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[arg.slice(1)] = next;
        i++;
      } else {
        flags[arg.slice(1)] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}
