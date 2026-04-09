import type { AgentStateName } from "../lib/types.js";
import type { PaneState } from "./tmux.js";

/** Tier-1 threshold: pane with output within this window is inferred busy */
export const ACTIVITY_THRESHOLD_MS = 10_000;

/** Grace period: skip idle checks for this duration after dispatching a task */
export const DISPATCH_GRACE_MS = 15_000;

export interface AgentIdleTracker {
  idleSince: number | null;
  lastDispatchedAt: number | null;
}

/**
 * Determine whether daemon should overwrite JSON state with observed pane state.
 *
 * Rules:
 *  1. NEVER overwrite with 'unknown' — unknown means "I don't know"
 *  2. idle → busy:   ALLOW (worker failed to self-report)
 *  3. busy → idle:   ALLOW (worker finished but didn't self-report)
 *  4. same → same:   SKIP  (no change, avoid unnecessary writes)
 *  5. working → busy: SKIP  (worker's 'working' is more specific)
 *  6. any → dead:    ALWAYS (pane death is authoritative)
 */
export function shouldReconcile(jsonState: AgentStateName, paneState: PaneState): boolean {
  if (paneState === "unknown") return false; // Rule 1
  if (paneState === "dead") return true; // Rule 6
  if (jsonState === "working" && paneState === "busy") return false; // Rule 5
  if (jsonState === paneState) return false; // Rule 4
  return true; // Rules 2, 3
}
