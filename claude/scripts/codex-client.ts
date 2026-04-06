#!/usr/bin/env bun
/**
 * codex-client.ts
 *
 * Unified Codex client with two modes:
 *   - JSONL mode (default): run `codex exec --json`, stream events
 *   - CLI mode (--cli): run `codex exec` with plain text output
 *
 * Mirrors patterns from codex-plugin-cc (codex-companion.mjs):
 *   - Model aliases (spark → gpt-5.3-codex-spark)
 *   - Reasoning effort levels (none/minimal/low/medium/high/xhigh)
 *   - JSONL event parsing (thread.started, item.completed, turn.completed)
 *
 * Usage:
 *   bun scripts/codex-client.ts --prompt "text"
 *   bun scripts/codex-client.ts --prompt-file path
 *   bun scripts/codex-client.ts --cli --prompt "text"
 */

import { existsSync, unlinkSync } from "fs";
import { findCodex } from "./codex-utils";

const DEFAULT_INACTIVITY_TIMEOUT = 3600; // seconds of silence before giving up

// Model aliases from codex-plugin-cc
const MODEL_ALIASES = new Map([
  ["spark", "gpt-5.3-codex-spark"],
]);

const VALID_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

interface Args {
  prompt: string;
  promptFile: string;
  cli: boolean;
  model: string;
  effort: string;
  sandbox: string;
  timeout: number;
  writable: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    prompt: "",
    promptFile: "",
    cli: false,
    model: "",
    effort: "",
    sandbox: "",
    timeout: -1,
    writable: false,
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
      case "--model":
        args.model = argv[++i] ?? "";
        break;
      case "--effort": {
        const val = (argv[++i] ?? "").toLowerCase();
        if (!VALID_EFFORTS.has(val)) {
          process.stderr.write(
            `[codex-client] ERROR: --effort must be one of: ${[...VALID_EFFORTS].join(", ")}\n`
          );
          process.exit(1);
        }
        args.effort = val;
        break;
      }
      case "--sandbox":
        args.sandbox = argv[++i] ?? "";
        break;
      case "--timeout": {
        const val = Number(argv[++i]);
        if (isNaN(val) || val <= 0) {
          process.stderr.write("[codex-client] ERROR: --timeout requires a positive number\n");
          process.exit(1);
        }
        args.timeout = val;
        break;
      }
      case "--writable":
        args.writable = true;
        break;
      default:
        process.stderr.write(`[codex-client] ERROR: Unknown argument: ${argv[i]}\n`);
        process.exit(1);
    }
  }

  if (args.timeout < 0) {
    args.timeout = DEFAULT_INACTIVITY_TIMEOUT;
  }

  // Mutual exclusion: --writable is shorthand for --sandbox workspace-write
  if (args.writable && args.sandbox) {
    process.stderr.write("[codex-client] ERROR: --writable and --sandbox are mutually exclusive\n");
    process.exit(1);
  }

  // Resolve model aliases (e.g., spark → gpt-5.3-codex-spark)
  if (args.model) {
    args.model = MODEL_ALIASES.get(args.model.toLowerCase()) ?? args.model;
  }

  return args;
}

/** Build common codex exec args from parsed Args */
function buildCmdArgs(args: Args, extra: string[]): string[] {
  const cmdArgs = ["exec", "--full-auto", "--ephemeral", ...extra];
  if (args.model) cmdArgs.push("-m", args.model);
  if (args.effort) cmdArgs.push("-c", `reasoning.effort="${args.effort}"`);
  if (args.sandbox) cmdArgs.push("-s", args.sandbox);
  if (args.writable) cmdArgs.push("-s", "workspace-write");
  return cmdArgs;
}

// --- JSONL streaming mode ---

interface CodexEvent {
  type: string;
  thread_id?: string;
  item?: {
    id: string;
    type: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    changes?: Array<{ path?: string }>;
  };
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
}

async function runJsonlMode(args: Args): Promise<void> {
  const codexBin = findCodex();
  if (!codexBin) {
    process.stderr.write(
      "[codex-client] ERROR: codex CLI not found.\n" +
      "  Install: npm install -g @openai/codex\n" +
      "  Or set CODEX_CLI_PATH env var.\n"
    );
    process.exit(127);
  }

  const prompt = args.prompt || (args.promptFile ? await Bun.file(args.promptFile).text() : "");
  if (!prompt) {
    process.stderr.write("[codex-client] ERROR: --prompt or --prompt-file required\n");
    process.exit(1);
  }

  const cmdArgs = buildCmdArgs(args, ["--json"]);
  cmdArgs.push(prompt);

  const proc = Bun.spawn([codexBin, ...cmdArgs], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    cwd: process.cwd(),
    env: { ...process.env },
  });

  // Pipe stderr for diagnostics
  (async () => {
    const stream = proc.stderr as ReadableStream<Uint8Array> | null;
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (process.env.CODEX_DEBUG) {
          process.stderr.write(`[codex-jsonl] ${decoder.decode(value, { stream: true })}`);
        }
      }
    } catch (e) {
      if (process.env.CODEX_DEBUG) {
        process.stderr.write(`[codex-jsonl] stderr stream error: ${e}\n`);
      }
    }
  })();

  // Inactivity timer — resets on every JSONL event from stdout
  let inactivityTimer: ReturnType<typeof setTimeout>;
  const resetTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
      process.stderr.write(`\n[codex-client] ERROR: No activity for ${args.timeout}s, timed out\n`);
      proc.kill();
      process.exit(124);
    }, args.timeout * 1000);
  };
  resetTimer();

  // Parse JSONL stream and collect agent messages
  const messages: string[] = [];
  const stream = proc.stdout as ReadableStream<Uint8Array> | null;
  if (stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetTimer();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: CodexEvent = JSON.parse(line);

            if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
              messages.push(event.item.text);
              process.stderr.write(event.item.text);
              if (!event.item.text.endsWith("\n")) process.stderr.write("\n");
            }

            if (event.type === "item.completed" && event.item?.type === "command_execution") {
              const cmd = event.item.command ?? "";
              const shortCmd = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
              process.stderr.write(`[codex] cmd: ${shortCmd} → exit ${event.item.exit_code ?? "?"}\n`);
            }

            if (event.type === "item.completed" && event.item?.type === "file_change") {
              const paths = (event.item.changes ?? []).map(c => c.path).filter(Boolean);
              if (paths.length > 0) {
                process.stderr.write(`[codex] files: ${paths.join(", ")}\n`);
              }
            }

            if (event.type === "turn.completed" && event.usage) {
              process.stderr.write(
                `[codex] tokens: in=${event.usage.input_tokens} cached=${event.usage.cached_input_tokens} out=${event.usage.output_tokens}\n`
              );
            }
          } catch {
            // Malformed JSONL line — skip silently
          }
        }
      }
    } catch (e) {
      if (process.env.CODEX_DEBUG) {
        process.stderr.write(`[codex-jsonl] stdout stream error: ${e}\n`);
      }
    }
  }

  clearTimeout(inactivityTimer!);
  await proc.exited;

  // Output collected agent messages to stdout
  const text = messages.join("\n\n");
  if (text) {
    process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
  } else {
    process.stderr.write("[codex-client] WARNING: No response text received\n");
  }
}

// --- CLI mode ---

async function runCliMode(args: Args): Promise<void> {
  const codexBin = findCodex();
  if (!codexBin) {
    process.stderr.write(
      "[codex-client] ERROR: codex CLI not found.\n" +
      "  Install: npm install -g @openai/codex\n" +
      "  Or set CODEX_CLI_PATH env var.\n"
    );
    process.exit(127);
  }

  const prompt = args.prompt || (args.promptFile ? await Bun.file(args.promptFile).text() : "");
  if (!prompt) {
    process.stderr.write("[codex-client] ERROR: --prompt or --prompt-file required\n");
    process.exit(1);
  }

  const outFile = `/tmp/codex-output-${Date.now()}.txt`;
  const cmdArgs = buildCmdArgs(args, ["-o", outFile]);
  cmdArgs.push(prompt);

  let timedOut = false;
  const proc = Bun.spawn([codexBin, ...cmdArgs], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    cwd: process.cwd(),
    env: { ...process.env },
  });

  // Execution timeout (CLI mode uses inherited stdio, so no activity monitoring)
  let executionTimer: ReturnType<typeof setTimeout>;
  executionTimer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, args.timeout * 1000);

  const exitCode = await proc.exited;
  clearTimeout(executionTimer!);

  if (timedOut) {
    process.stderr.write(`[codex-client] ERROR: Execution timeout after ${args.timeout}s\n`);
    process.exit(124);
  }

  // Read output file if it exists
  if (existsSync(outFile)) {
    const output = await Bun.file(outFile).text();
    if (output.trim()) {
      process.stdout.write(output + (output.endsWith("\n") ? "" : "\n"));
    }
    try { unlinkSync(outFile); } catch {}
  }

  if (exitCode !== 0) {
    process.stderr.write(`[codex-client] Hint: If auth error, try running: codex login\n`);
  }

  process.exit(exitCode);
}

// --- Main ---

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(
      "Usage: bun scripts/codex-client.ts [--cli] --prompt \"text\" [options]\n" +
      "       bun scripts/codex-client.ts [--cli] --prompt-file path [options]\n" +
      "\nOptions:\n" +
      "  --cli              Use plain-text CLI mode (default: JSONL streaming)\n" +
      "  --model MODEL      Model to use (aliases: spark → gpt-5.3-codex-spark)\n" +
      "  --effort LEVEL     Reasoning effort: none, minimal, low, medium, high, xhigh\n" +
      "  --sandbox MODE     Sandbox mode: read-only, workspace-write, danger-full-access\n" +
      "  --writable         Shorthand for --sandbox workspace-write\n" +
      "  --timeout SECS     Inactivity timeout (default: 3600)\n"
    );
    process.exit(1);
  }

  const args = parseArgs(argv);

  if (!args.prompt && !args.promptFile) {
    process.stderr.write("[codex-client] ERROR: --prompt or --prompt-file required\n");
    process.exit(1);
  }

  if (args.promptFile && !existsSync(args.promptFile)) {
    process.stderr.write(`[codex-client] ERROR: prompt file not found: ${args.promptFile}\n`);
    process.exit(1);
  }

  if (args.cli) {
    await runCliMode(args);
  } else {
    await runJsonlMode(args);
  }
}

main();
