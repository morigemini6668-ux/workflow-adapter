#!/usr/bin/env bun
/**
 * copilot-client.ts
 *
 * Unified Copilot client with two modes:
 *   - ACP mode (default): spawn copilot --acp --stdio, one-shot per request
 *   - CLI mode (--cli): run `copilot -p "prompt"` directly
 *
 * Usage:
 *   bun scripts/copilot-client.ts --prompt "text"
 *   bun scripts/copilot-client.ts --prompt-file path
 *   bun scripts/copilot-client.ts --cli --prompt "text"
 *   bun scripts/copilot-client.ts --cli --interactive
 */

import { existsSync } from "fs";
import { findCopilot } from "./copilot-utils";

const DEFAULT_MODEL = ""; // empty = use copilot CLI default
const DEFAULT_ACP_TIMEOUT = 600;
const DEFAULT_CLI_TIMEOUT = 1200;

interface Args {
  prompt: string;
  promptFile: string;
  cli: boolean;
  interactive: boolean;
  model: string;
  timeout: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    prompt: "",
    promptFile: "",
    cli: false,
    interactive: false,
    model: DEFAULT_MODEL,
    timeout: -1, // sentinel: use mode-specific default
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
      case "--port-file":
        // Legacy compat: ignore
        argv[++i];
        break;
      default:
        process.stderr.write(`[copilot-client] ERROR: Unknown argument: ${argv[i]}\n`);
        process.exit(1);
    }
  }

  if (args.timeout < 0) {
    args.timeout = args.cli ? DEFAULT_CLI_TIMEOUT : DEFAULT_ACP_TIMEOUT;
  }

  return args;
}

// --- ACP mode (Agent Client Protocol via stdio) ---

interface AcpMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
  params?: Record<string, unknown>;
}

class AcpClient {
  private proc: ReturnType<typeof Bun.spawn>;
  private buffer = "";
  private pendingResolvers = new Map<number, (msg: AcpMessage) => void>();
  private notificationHandlers: ((msg: AcpMessage) => void)[] = [];
  private nextId = 1;
  private readLoop: Promise<void>;

  constructor(copilotBin: string, args: string[]) {
    this.proc = Bun.spawn([copilotBin, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
      env: { ...process.env },
    });

    // Pipe stderr for diagnostics
    this.pipeStderr();

    // Start reading stdout
    this.readLoop = this.startReading();
  }

  private async pipeStderr(): Promise<void> {
    const stream = this.proc.stderr as ReadableStream<Uint8Array> | null;
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Suppress stderr unless debugging
        if (process.env.COPILOT_DEBUG) {
          process.stderr.write(`[copilot-acp] ${decoder.decode(value, { stream: true })}`);
        }
      }
    } catch {}
  }

  private async startReading(): Promise<void> {
    const stream = this.proc.stdout as ReadableStream<Uint8Array> | null;
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } catch {}
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: AcpMessage = JSON.parse(line);
        this.handleMessage(msg);
      } catch {}
    }
  }

  private handleMessage(msg: AcpMessage): void {
    // Response to a request we sent
    if (msg.id !== undefined && this.pendingResolvers.has(msg.id)) {
      const resolve = this.pendingResolvers.get(msg.id)!;
      this.pendingResolvers.delete(msg.id);
      resolve(msg);
      return;
    }

    // Server-initiated request (e.g. permission request)
    if (msg.method && msg.id !== undefined) {
      // Auto-approve permission requests
      if (msg.method === "session/requestPermission") {
        this.sendRaw({ jsonrpc: "2.0", id: msg.id, result: { permission: "allow" } });
        return;
      }
    }

    // Notification (no id, has method)
    for (const handler of this.notificationHandlers) {
      handler(msg);
    }
  }

  private sendRaw(obj: Record<string, unknown>): void {
    this.proc.stdin!.write(JSON.stringify(obj) + "\n");
  }

  async request(method: string, params: Record<string, unknown>): Promise<AcpMessage> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pendingResolvers.set(id, resolve);
      this.sendRaw({ jsonrpc: "2.0", method, id, params });
    });
  }

  onNotification(handler: (msg: AcpMessage) => void): void {
    this.notificationHandlers.push(handler);
  }

  async kill(): Promise<void> {
    this.proc.kill();
    await this.proc.exited;
  }
}

async function runAcpMode(args: Args): Promise<void> {
  const copilotBin = findCopilot();
  if (!copilotBin) {
    process.stderr.write(
      "[copilot-client] ERROR: copilot CLI not found.\n" +
      "  Set COPILOT_CLI_PATH env var or install copilot CLI.\n"
    );
    process.exit(127);
  }

  const prompt = args.prompt || (args.promptFile ? await Bun.file(args.promptFile).text() : "");
  if (!prompt) {
    process.stderr.write("[copilot-client] ERROR: --prompt or --prompt-file required\n");
    process.exit(1);
  }

  const cmdArgs = ["--acp", "--stdio", "--yolo", "--no-ask-user", "--autopilot", "--add-dir", process.cwd()];
  if (args.model) cmdArgs.push("--model", args.model);

  const client = new AcpClient(copilotBin, cmdArgs);

  // Collect streaming text and print in real-time to stderr
  const chunks: string[] = [];
  client.onNotification((msg) => {
    const params = msg.params as Record<string, unknown> | undefined;
    const update = params?.update as Record<string, unknown> | undefined;
    if (!update) return;

    const updateType = update.sessionUpdate as string | undefined;
    if (updateType === "agent_message_chunk") {
      const content = update.content as Record<string, unknown> | undefined;
      if (content?.type === "text" && typeof content.text === "string") {
        chunks.push(content.text);
        process.stderr.write(content.text);
      }
    }
  });

  const timer = setTimeout(async () => {
    process.stderr.write(`[copilot-client] ERROR: Timed out after ${args.timeout}s\n`);
    await client.kill();
    process.exit(124);
  }, args.timeout * 1000);

  try {
    // Step 1: Initialize
    const initResp = await client.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "workflow-adapter", version: "1.0.0" },
      capabilities: {},
    });
    if (initResp.error) {
      process.stderr.write(`[copilot-client] ERROR: Initialize failed: ${initResp.error.message}\n`);
      process.exit(1);
    }

    // Step 2: Create session
    const sessionResp = await client.request("session/new", {
      cwd: process.cwd(),
      mcpServers: [],
    });
    if (sessionResp.error) {
      process.stderr.write(`[copilot-client] ERROR: Session creation failed: ${sessionResp.error.message}\n`);
      process.exit(1);
    }
    const sessionId = (sessionResp.result as Record<string, unknown>)?.sessionId as string;
    if (!sessionId) {
      process.stderr.write("[copilot-client] ERROR: No sessionId in response\n");
      process.exit(1);
    }

    // Step 3: Send prompt and wait for completion
    const promptResp = await client.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: prompt }],
    });
    if (promptResp.error) {
      process.stderr.write(`[copilot-client] ERROR: Prompt failed: ${promptResp.error.message}\n`);
      process.exit(1);
    }

    // Flush stderr stream with a newline if needed, then echo to stdout for downstream consumers
    const text = chunks.join("");
    if (text) {
      if (!text.endsWith("\n")) process.stderr.write("\n");
      process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
    } else {
      process.stderr.write("[copilot-client] WARNING: No response text received\n");
    }
  } finally {
    clearTimeout(timer);
    await client.kill();
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
  cmdArgs.push("-s", "--yolo", "--autopilot", "--no-ask-user", "--add-dir", process.cwd());
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
      "  --cli            Use one-shot CLI mode (default: ACP mode)\n" +
      "  --interactive    Inherit stdio (CLI mode only)\n" +
      "  --model MODEL    Model to use (default: copilot CLI default)\n" +
      "  --timeout SECS   Timeout (default: 120 ACP, 600 CLI)\n"
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
    await runAcpMode(args);
  }
}

main();
