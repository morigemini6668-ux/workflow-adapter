import type { AgentStateName } from "../lib/types.js";
import type { PaneState } from "./tmux.js";

/** Tier-1 threshold: pane with output within this window is inferred busy */
export const ACTIVITY_THRESHOLD_MS = 10_000;

/** Grace period: skip idle checks for this duration after dispatching a task */
export const DISPATCH_GRACE_MS = 15_000;

/** States that only a worker should set — daemon must not overwrite */
const PROTECTED_STATES: ReadonlySet<AgentStateName> = new Set(["blocked", "done", "failed", "draining"]);

export interface AgentIdleTracker {
  idleSince: number | null;
  lastDispatchedAt: number | null;
}

/**
 * Map PaneState to AgentStateName for JSON persistence.
 * PaneState 'busy' has no direct AgentStateName equivalent — map to 'working'.
 * PaneState 'dead' maps to 'failed'.
 */
export function toAgentState(paneState: PaneState): AgentStateName {
  switch (paneState) {
    case "idle":
      return "idle";
    case "busy":
      return "working";
    case "dead":
      return "failed";
    case "unknown":
      return "idle"; // should never be called with unknown (shouldReconcile blocks it)
  }
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
 *  7. blocked/done/failed → any (except dead): SKIP (worker-set states are protected)
 */
export function shouldReconcile(jsonState: AgentStateName, paneState: PaneState): boolean {
  if (paneState === "unknown") return false; // Rule 1
  if (paneState === "dead") return true; // Rule 6
  if (PROTECTED_STATES.has(jsonState)) return false; // Rule 7
  if (jsonState === "working" && paneState === "busy") return false; // Rule 5
  if (jsonState === toAgentState(paneState)) return false; // Rule 4 (compare mapped values)
  return true; // Rules 2, 3
}
