import { existsSync } from "node:fs";
import { archiveSession, findActiveSession } from "../daemon/state.js";
import { hasSession, killSession } from "../daemon/tmux.js";
import { socketPath } from "../lib/constants.js";
import { sendCommand } from "./client.js";
import { findProjectRoot, readProjectName } from "./init.js";

export default async function stop(args: string[]): Promise<void> {
  const force = args.includes("--force") || args.includes("-f");

  try {
    const response = await sendCommand("stop", { force });

    if (response.success) {
      console.log("Session stopped and archived.");
    } else {
      console.error(`Failed to stop: ${response.error}`);
      process.exit(1);
    }
  } catch (err) {
    // Daemon not running — check for stale session and clean up
    if (
      err instanceof Error &&
      (err.message.includes("Daemon not running") || err.message.includes("not responding"))
    ) {
      const cleaned = await cleanupStaleSession();
      if (cleaned) {
        console.log("Stale session cleaned up and archived.");
      } else {
        console.error("Error: No active session to stop.");
        process.exit(1);
      }
    } else {
      throw err;
    }
  }
}

/**
 * Clean up a stale session when the daemon is not running.
 * Archives the session and kills any leftover tmux sessions.
 */
async function cleanupStaleSession(): Promise<boolean> {
  const root = await findProjectRoot();
  if (!root) return false;

  const project = await readProjectName(root);
  const session = await findActiveSession(project);
  if (!session) return false;

  // Kill leftover tmux session if it exists
  if (session.tmux_session && (await hasSession(session.tmux_session))) {
    await killSession(session.tmux_session);
  }

  // Remove stale socket
  const sock = socketPath(project);
  if (existsSync(sock)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(sock).catch(() => {
      /* ignore missing */
    });
  }

  // Archive the stale session
  await archiveSession({ project, sessionId: session.id });

  return true;
}
