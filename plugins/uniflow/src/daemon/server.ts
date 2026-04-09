import { unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { socketPath, UNIFLOW_SOCKETS_DIR } from "../lib/constants.js";
import { type DaemonRequest, DaemonRequestSchema, type DaemonResponse } from "../lib/types.js";
import {
  handleAssign,
  handleKill,
  handleLogs,
  handleNudge,
  handlePeek,
  handleRespawn,
  handleSend,
  handleStatus,
  handleStop,
  handleTaskCreate,
  handleTasks,
  handleWorktreeCreate,
  handleWorktreeMerge,
} from "./handlers.js";
import { listAgents, type OutboxReader, type SessionContext } from "./state.js";

// ── IPC Server ───────────────────────────────────────────────────────

export interface DaemonServer {
  close(): void;
}

/**
 * Start the Unix domain socket IPC server.
 * Listens for DaemonRequest messages and routes them to handlers.
 */
export async function startServer(
  ctx: SessionContext,
  outboxReader: OutboxReader,
  onSpawn?: (args: Record<string, unknown>) => Promise<unknown>,
): Promise<DaemonServer> {
  const sockPath = socketPath(ctx.project);
  await mkdir(UNIFLOW_SOCKETS_DIR, { recursive: true });

  // Clean up stale socket
  try {
    unlinkSync(sockPath);
  } catch {
    /* ignore missing */
  }

  const server = Bun.listen({
    unix: sockPath,
    socket: {
      async data(socket, rawData) {
        const text = typeof rawData === "string" ? rawData : Buffer.from(rawData).toString("utf-8");

        // Handle multiple newline-delimited messages in one chunk
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;

          let response: DaemonResponse;
          try {
            const request = DaemonRequestSchema.parse(JSON.parse(line));
            response = await handleRequest(ctx, request, outboxReader, onSpawn);
          } catch (err) {
            response = {
              requestId: "unknown",
              success: false,
              error: err instanceof Error ? err.message : "Parse error",
            };
          }

          socket.write(`${JSON.stringify(response)}\n`);
        }
      },
      open() {
        /* noop — required by Bun.listen */
      },
      close() {
        /* noop — required by Bun.listen */
      },
      error(_socket, err) {
        console.error("[daemon] socket error:", err.message);
      },
    },
  });

  return {
    close() {
      server.stop();
      try {
        unlinkSync(sockPath);
      } catch {
        /* ignore missing */
      }
    },
  };
}

// ── Command Router ───────────────────────────────────────────────────

async function handleRequest(
  ctx: SessionContext,
  req: DaemonRequest,
  outboxReader: OutboxReader,
  onSpawn?: (args: Record<string, unknown>) => Promise<unknown>,
): Promise<DaemonResponse> {
  const ok = (data?: unknown): DaemonResponse => ({
    requestId: req.requestId,
    success: true,
    data,
  });

  const fail = (error: string): DaemonResponse => ({
    requestId: req.requestId,
    success: false,
    error,
  });

  try {
    switch (req.command) {
      case "status":
        return ok(await handleStatus(ctx, outboxReader, req.args));

      case "agents":
        return ok(await listAgents(ctx));

      case "tasks":
        return ok(await handleTasks(ctx, req.args));

      case "spawn":
        if (!onSpawn) return fail("Spawn handler not registered");
        return ok(await onSpawn(req.args));

      case "kill":
        return ok(await handleKill(ctx, req.args));

      case "task-create":
        return ok(await handleTaskCreate(ctx, req.args));

      case "assign":
        return ok(await handleAssign(ctx, req.args));

      case "send":
        return ok(await handleSend(ctx, req.args));

      case "nudge":
        return ok(await handleNudge(ctx, req.args));

      case "respawn":
        return ok(await handleRespawn(ctx, req.args));

      case "logs":
        return ok(await handleLogs(ctx, req.args));

      case "peek":
        return ok(await handlePeek(ctx, req.args));

      case "stop":
        return ok(await handleStop(ctx));

      case "worktree-create":
        return ok(await handleWorktreeCreate(req.args));

      case "worktree-merge":
        return ok(await handleWorktreeMerge(req.args));

      default:
        return fail(`Unknown command: ${req.command}`);
    }
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return fail(
        'Session not found (may have been archived). Start a new session with "uniflow start".',
      );
    }
    return fail(err instanceof Error ? err.message : "Internal error");
  }
}
