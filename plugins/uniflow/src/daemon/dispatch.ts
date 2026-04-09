import { type CliType, type DispatchMode, INTERRUPT_KEY } from "../lib/types.js";
import { appendEvent, readAgentState, type SessionContext, writeInbox } from "./state.js";
import { detectState, isPaneDead, type PaneState, sendMessage, tmux } from "./tmux.js";

// ── Nudge Gate ──────────────────────────────────────────────────────

/**
 * Unified nudge gate — replaces 3 inconsistent inline checks.
 * Only nudge agents confirmed idle. All other states block nudge.
 */
export function shouldNudge(paneState: PaneState): boolean {
  return paneState === "idle";
}

// ── Dispatch ──────────────────────────────────────────────────────────

export interface DispatchTarget {
  name: string;
  paneId: string;
  cli: CliType;
}

/**
 * Dispatch a message to an agent: write inbox + trigger via tmux.
 *
 * Modes:
 * - interrupt: send CLI-specific interrupt key first (for busy agents)
 * - nudge: only deliver if agent is idle (for gentle task delivery)
 */
export async function dispatch(
  ctx: SessionContext,
  target: DispatchTarget,
  inboxContent: string,
  triggerText: string,
  mode: DispatchMode,
): Promise<void> {
  if (await isPaneDead(target.paneId)) {
    throw new Error(`Agent ${target.name} pane is dead (${target.paneId})`);
  }

  // Step 1: Write inbox atomically
  await writeInbox(ctx, target.name, inboxContent);

  // Step 2: Deliver trigger based on mode
  if (mode === "interrupt") {
    await interruptDeliver(target, triggerText);
  } else {
    await nudgeDeliver(target, triggerText);
  }

  // Step 3: Log the event
  await appendEvent(ctx, "inbox_written", {
    agent: target.name,
    mode,
    trigger: triggerText,
  });
}

/**
 * Interrupt delivery: interrupt agent's current work, then send trigger.
 *
 * Sequence:
 * 1. Send CLI-specific interrupt key (C-c for Claude, Escape for Codex)
 * 2. Wait 500ms for agent to stop
 * 3. For Codex: extra C-u (clear line) to handle Enter-stuck bug
 * 4. Paste trigger text via paste-buffer
 * 5. Press Enter (CLI-specific count)
 */
async function interruptDeliver(target: DispatchTarget, triggerText: string): Promise<void> {
  const interruptKey = INTERRUPT_KEY[target.cli];

  // Phase 1: Send interrupt
  await tmux(["send-keys", "-t", target.paneId, interruptKey]);
  await sleep(500);

  // Phase 2: Codex fallback — clear line to handle Enter-stuck bug
  if (target.cli === "codex") {
    await tmux(["send-keys", "-t", target.paneId, "C-u"]);
    await sleep(100);
  }

  // Phase 3-5: Send trigger message
  await sendMessage(target.paneId, target.cli, triggerText);
}

/**
 * Nudge delivery: only send if agent appears idle.
 *
 * Sequence:
 * 1. Capture pane, verify agent is idle
 * 2. If busy, skip (agent is working, will check inbox on completion)
 * 3. If idle, paste trigger + Enter
 */
async function nudgeDeliver(target: DispatchTarget, triggerText: string): Promise<void> {
  const state = await detectState(target.paneId);

  if (state === "dead") {
    throw new Error(`Agent ${target.name} pane is dead during nudge`);
  }

  if (!shouldNudge(state)) {
    return;
  }

  await sendMessage(target.paneId, target.cli, triggerText);
}

// ── Convenience Wrappers ──────────────────────────────────────────────

/**
 * Send a task assignment to an agent.
 * Writes task instructions to inbox and triggers with short summary.
 */
export async function dispatchTask(
  ctx: SessionContext,
  target: DispatchTarget,
  taskId: string,
  instructions: string,
  mode: DispatchMode = "nudge",
): Promise<void> {
  // Block dispatch to draining workers (shutdown in progress)
  try {
    const agentState = await readAgentState(ctx, target.name);
    if (agentState.state === "draining") {
      throw new Error(`Agent ${target.name} is draining (shutdown in progress)`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("draining")) throw err;
    // Agent state file might not exist — continue with dispatch
  }

  const triggerText = `New task assigned: ${taskId}. Check your inbox.`;
  await markDispatched(target.name);
  await dispatch(ctx, target, instructions, triggerText, mode);

  await appendEvent(ctx, "task_assigned", {
    task: taskId,
    agent: target.name,
    mode,
  });
}

/**
 * Send a freeform message to an agent.
 */
export async function dispatchMessage(
  ctx: SessionContext,
  target: DispatchTarget,
  message: string,
  mode: DispatchMode = "nudge",
): Promise<void> {
  const triggerText = "New message in inbox. Check your inbox.";
  await markDispatched(target.name);
  await dispatch(ctx, target, message, triggerText, mode);

  await appendEvent(ctx, "message_sent", {
    agent: target.name,
    mode,
  });
}

/**
 * Send a nudge to remind agent to check inbox.
 * Doesn't modify inbox — just sends trigger text.
 */
export async function nudgeAgent(ctx: SessionContext, target: DispatchTarget): Promise<boolean> {
  const state = await detectState(target.paneId);
  if (!shouldNudge(state)) return false;

  await sendMessage(target.paneId, target.cli, "Check your inbox for pending tasks.");

  await appendEvent(ctx, "agent_nudged", {
    agent: target.name,
  });
  return true;
}

// ── Grace Period Tracking ────────────────────────────────────────────

/**
 * Record that a task/message was dispatched to an agent.
 * Uses dynamic import to avoid circular dependency with monitor.ts.
 */
async function markDispatched(name: string): Promise<void> {
  const { idleTrackers } = await import("./monitor.js");
  const tracker = idleTrackers.get(name);
  if (tracker) {
    tracker.lastDispatchedAt = Date.now();
  } else {
    idleTrackers.set(name, { idleSince: null, lastDispatchedAt: Date.now() });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
