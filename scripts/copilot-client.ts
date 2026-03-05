#!/usr/bin/env bun
/**
 * copilot-client.ts
 *
 * Unified Copilot client with two modes:
 *   - Server mode (default): connect to headless server via JSON-RPC
 *   - CLI mode (--cli): run `copilot -p "prompt"` directly
 *
 * Usage:
 *   bun scripts/copilot-client.ts --prompt "text"
 *   bun scripts/copilot-client.ts --prompt-file path
 *   bun scripts/copilot-client.ts --cli --prompt "text"
 *   bun scripts/copilot-client.ts --cli --interactive
 */

import { existsSync } from "fs";
import { join } from "path";
import net from "net";
import { findCopilot, readPortFile, pingServer } from "./copilot-utils";

const DEFAULT_MODEL = ""; // empty = use copilot CLI default
const DEFAULT_SERVER_TIMEOUT = 60;
const DEFAULT_CLI_TIMEOUT = 600;

interface Args {
  prompt: string;
  promptFile: string;
  cli: boolean;
  interactive: boolean;
  model: string;
  timeout: number;
  session: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    prompt: "",
    promptFile: "",
    cli: false,
    interactive: false,
    model: DEFAULT_MODEL,
    timeout: -1, // sentinel: use mode-specific default
    session: "",
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--prompt":
        args.prompt = argv[++i] ?? "";
        break;
      case "--prompt-file":
        args.promptFile = argv[++i] ?? "";
        break;
      case "--cli":
        args.cli = true;
        break;
      case "--interactive":
        args.interactive = true;
        break;
      case "--model":
        args.model = argv[++i] ?? DEFAULT_MODEL;
        break;
      case "--timeout": {
        const val = Number(argv[++i]);
        if (isNaN(val) || val <= 0) {
          process.stderr.write("[copilot-client] ERROR: --timeout requires a positive number\n");
          process.exit(1);
        }
        args.timeout = val;
        break;
      }
      case "--session":
        args.session = argv[++i] ?? "";
        break;
      case "--port-file":
        // Legacy compat: ignore, use --session instead
        argv[++i];
        break;
      default:
        process.stderr.write(`[copilot-client] ERROR: Unknown argument: ${argv[i]}\n`);
        process.exit(1);
    }
  }

  if (args.timeout < 0) {
    args.timeout = args.cli ? DEFAULT_CLI_TIMEOUT : DEFAULT_SERVER_TIMEOUT;
  }

  return args;
}

// --- JSON-RPC helpers (LSP-style framing) ---

function sendJsonRpc(socket: net.Socket, method: string, params: Record<string, unknown>, id: number): void {
  const payload = JSON.stringify({ jsonrpc: "2.0", method, params, id });
  const payloadBytes = Buffer.from(payload, "utf-8");
  const header = `Content-Length: ${payloadBytes.length}\r\n\r\n`;
  socket.write(header + payload);
}

function parseMessages(raw: string): any[] {
  const messages: any[] = [];
  const rawBytes = Buffer.from(raw, "utf-8");
  let pos = 0;
  const headerPattern = /Content-Length: (\d+)\r\n\r\n/g;
  let match;
  while ((match = headerPattern.exec(raw)) !== null) {
    const contentLength = Number(match[1]);
    const bodyStartStr = match.index + match[0].length;
    // Convert string offset to byte offset for body extraction
    const headerBytes = Buffer.from(raw.substring(0, bodyStartStr), "utf-8");
    const bodyEnd = headerBytes.length + contentLength;
    if (bodyEnd > rawBytes.length) break;
    const bodyBytes = rawBytes.subarray(headerBytes.length, bodyEnd);
    try {
      messages.push(JSON.parse(bodyBytes.toString("utf-8")));
    } catch {}
  }
  return messages;
}

function extractAssistantText(messages: any[]): string {
  const deltas: string[] = [];
  let fullContent: string | null = null;

  for (const msg of messages) {
    const event = msg?.params?.event ?? {};
    const etype = event.type ?? "";
    const data = event.data ?? {};

    if (etype === "assistant.message_delta") {
      deltas.push(data.delta ?? "");
    } else if (etype === "assistant.message") {
      if (data.content) fullContent = data.content;
    }
  }

  if (fullContent) return fullContent;
  if (deltas.length) return deltas.join("");
  return "";
}

function recvUntil(socket: net.Socket, markers: string[], timeoutSecs: number): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(buf);
    }, timeoutSecs * 1000);

    socket.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      for (const marker of markers) {
        if (buf.includes(marker)) {
          clearTimeout(timer);
          // Drain briefly for remaining data
          setTimeout(() => {
            socket.removeAllListeners("data");
            resolve(buf);
          }, 500);
          return;
        }
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(buf);
    });

    socket.on("close", () => {
      clearTimeout(timer);
      resolve(buf);
    });
  });
}

// --- Server mode ---

async function connectToServer(host: string, port: number): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => resolve(socket));
    socket.on("error", () => resolve(null));
  });
}

async function autoStartServer(session?: string): Promise<number> {
  process.stderr.write("[copilot-client] No active server found. Starting one...\n");
  const startScript = join(import.meta.dir, "copilot-server-start.ts");
  const startArgs = ["bun", startScript];
  if (session) startArgs.push("--session", session);
  const startProc = Bun.spawn(startArgs, {
    stdout: "pipe",
    stderr: "inherit",
    stdin: "ignore",
  });
  const exitCode = await startProc.exited;
  if (exitCode !== 0) {
    process.stderr.write("[copilot-client] ERROR: Failed to auto-start server\n");
    process.exit(1);
  }
  const port = readPortFile(session || undefined);
  if (port === null) {
    process.stderr.write("[copilot-client] ERROR: Server started but port file not found\n");
    process.exit(1);
  }
  return port;
}

async function runServerMode(args: Args): Promise<void> {
  let port = readPortFile(args.session || undefined);
  if (port === null) {
    port = await autoStartServer(args.session || undefined);
  }

  // Connect (try IPv6 then IPv4)
  let socket: net.Socket | null = null;
  for (const host of ["::1", "127.0.0.1"]) {
    socket = await connectToServer(host, port);
    if (socket) break;
  }
  if (!socket) {
    process.stderr.write(
      `[copilot-client] ERROR: Cannot connect to server on port ${port}\n` +
      `  Server not responding. Restart with: bun scripts/copilot-server-start.ts\n`
    );
    process.exit(1);
  }

  try {
    // Step 1: Ping
    sendJsonRpc(socket, "ping", {}, 1);
    let raw = await recvUntil(socket, ['"pong"'], 5);
    if (!raw.includes('"pong"')) {
      process.stderr.write("[copilot-client] ERROR: Server did not respond to ping\n");
      process.exit(1);
    }

    // Step 2: Create session
    sendJsonRpc(socket, "session.create", {}, 2);
    raw = await recvUntil(socket, ["session.start"], 10);
    const sessionMsgs = parseMessages(raw);
    let sessionId: string | null = null;
    for (const msg of sessionMsgs) {
      const event = msg?.params?.event ?? {};
      if (event.type === "session.start") {
        sessionId = event.data?.sessionId ?? null;
        break;
      }
      const sid = msg?.params?.sessionId;
      if (sid) { sessionId = sid; break; }
    }
    if (!sessionId) {
      process.stderr.write("[copilot-client] ERROR: Failed to create session\n");
      process.exit(1);
    }

    // Step 3: Send prompt
    const prompt = args.prompt || (args.promptFile ? await Bun.file(args.promptFile).text() : "");
    sendJsonRpc(socket, "session.send", { sessionId, prompt }, 3);

    // Step 4: Collect response
    raw = await recvUntil(socket, ["session.idle"], args.timeout);
    const msgs = parseMessages(raw);
    const text = extractAssistantText(msgs);

    if (text) {
      process.stdout.write(text);
      if (!text.endsWith("\n")) process.stdout.write("\n");
    } else {
      process.stderr.write("[copilot-client] WARNING: No response received from server\n");
    }
  } finally {
    socket.destroy();
  }
}

// --- CLI mode ---

async function runCliMode(args: Args): Promise<void> {
  const copilotBin = findCopilot();
  if (!copilotBin) {
    process.stderr.write(
      `[copilot-client] ERROR: copilot CLI not found.\n` +
      `  Set COPILOT_CLI_PATH env var or install copilot CLI.\n`
    );
    process.exit(127);
  }

  const prompt = args.prompt || (args.promptFile ? await Bun.file(args.promptFile).text() : "");
  if (!prompt && !args.interactive) {
    process.stderr.write("[copilot-client] ERROR: --prompt or --prompt-file required (or use --interactive)\n");
    process.exit(1);
  }

  const cmdArgs: string[] = [];
  if (prompt) {
    cmdArgs.push("-p", prompt);
  }
  cmdArgs.push("-s", "--allow-all-tools", "--autopilot", "--add-dir", process.cwd());
  if (args.model) cmdArgs.push("--model", args.model);

  const useInherit = args.interactive;

  let timedOut = false;
  const proc = Bun.spawn([copilotBin, ...cmdArgs], {
    stdout: useInherit ? "inherit" : "pipe",
    stderr: "inherit",
    stdin: useInherit ? "inherit" : "ignore",
    env: { ...process.env },
  });

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, args.timeout * 1000);

  // If pipe mode, relay stdout while also allowing capture via shell redirect
  if (!useInherit && proc.stdout) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        process.stdout.write(decoder.decode(value, { stream: true }));
      }
    } catch {}
  }

  const exitCode = await proc.exited;
  clearTimeout(timer);

  if (timedOut) {
    process.stderr.write(`[copilot-client] ERROR: copilot CLI timed out after ${args.timeout}s\n`);
    process.exit(124);
  }

  if (exitCode !== 0) {
    process.stderr.write("[copilot-client] Hint: If auth error, try running: copilot auth login\n");
  }

  process.exit(exitCode);
}

// --- Main ---

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(
      "Usage: bun scripts/copilot-client.ts [--cli] --prompt \"text\" [options]\n" +
      "       bun scripts/copilot-client.ts [--cli] --prompt-file path [options]\n" +
      "       bun scripts/copilot-client.ts --cli --interactive [options]\n" +
      "\nOptions:\n" +
      "  --cli            Use one-shot CLI mode (default: server mode)\n" +
      "  --interactive    Inherit stdio (CLI mode only)\n" +
      "  --model MODEL    Model to use (default: copilot CLI default)\n" +
      "  --timeout SECS   Timeout (default: 60 server, 600 CLI)\n" +
      "  --session NAME   Connect to specific session (server mode)\n"
    );
    process.exit(1);
  }

  const args = parseArgs(argv);

  if (!args.prompt && !args.promptFile && !args.interactive) {
    process.stderr.write("[copilot-client] ERROR: --prompt, --prompt-file, or --interactive required\n");
    process.exit(1);
  }

  if (args.promptFile && !existsSync(args.promptFile)) {
    process.stderr.write(`[copilot-client] ERROR: prompt file not found: ${args.promptFile}\n`);
    process.exit(1);
  }

  if (args.cli) {
    await runCliMode(args);
  } else {
    await runServerMode(args);
  }
}

main();
