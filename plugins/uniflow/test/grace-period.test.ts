import { describe, expect, test } from "bun:test";
import { DISPATCH_GRACE_MS, type AgentIdleTracker } from "../src/daemon/reconcile.js";

/**
 * Grace period logic extracted for testability.
 * Mirrors the check in monitor.ts checkIdleNudge().
 */
function isWithinGracePeriod(tracker: AgentIdleTracker): boolean {
  return (
    tracker.lastDispatchedAt !== null &&
    Date.now() - tracker.lastDispatchedAt < DISPATCH_GRACE_MS
  );
}

describe("Post-dispatch grace period", () => {
  test("5s after dispatch → within grace period (skip nudge)", () => {
    const tracker: AgentIdleTracker = {
      idleSince: null,
      lastDispatchedAt: Date.now() - 5_000,
    };
    expect(isWithinGracePeriod(tracker)).toBe(true);
  });

  test("20s after dispatch → past grace period (allow nudge)", () => {
    const tracker: AgentIdleTracker = {
      idleSince: null,
      lastDispatchedAt: Date.now() - 20_000,
    };
    expect(isWithinGracePeriod(tracker)).toBe(false);
  });

  test("no dispatch recorded → no grace period (allow nudge)", () => {
    const tracker: AgentIdleTracker = {
      idleSince: Date.now() - 60_000,
      lastDispatchedAt: null,
    };
    expect(isWithinGracePeriod(tracker)).toBe(false);
  });

  test("DISPATCH_GRACE_MS is 15 seconds", () => {
    expect(DISPATCH_GRACE_MS).toBe(15_000);
  });
});
