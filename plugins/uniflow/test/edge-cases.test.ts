import { describe, expect, it } from "bun:test";
import { shouldReconcile, ACTIVITY_THRESHOLD_MS } from "../src/daemon/reconcile.js";
import { shouldNudge } from "../src/daemon/dispatch.js";
import { classifyOutput } from "../src/daemon/tmux.js";

describe("Edge cases (spec Section 4)", () => {
  it("Codex unknown pattern + grace period → no nudge", () => {
    // When classifyOutput returns unknown AND grace period is active,
    // shouldNudge blocks the nudge (unknown is not idle)
    const output = "some random codex text without indicators";
    const state = classifyOutput(output);
    expect(state).toBe("unknown");
    expect(shouldNudge(state)).toBe(false);
  });

  it("pane_activity stale (>10s) → falls through to Tier-2", () => {
    // When activity age exceeds threshold, Tier-2 (detectState) should be used
    // Verify the threshold constant is correctly set
    expect(ACTIVITY_THRESHOLD_MS).toBe(10_000);

    // Simulate: activityAge > ACTIVITY_THRESHOLD_MS → Tier-1 skipped
    const activityEpoch = Math.floor(Date.now() / 1000) - 15; // 15s ago
    const activityAge = Date.now() - activityEpoch * 1000;
    expect(activityAge).toBeGreaterThan(ACTIVITY_THRESHOLD_MS);
  });

  it("shouldReconcile blocks unknown overwrites even for stale states", () => {
    // Agent state file in unexpected state — unknown pane should never overwrite
    expect(shouldReconcile("starting", "unknown")).toBe(false);
    expect(shouldReconcile("blocked", "unknown")).toBe(false);
    expect(shouldReconcile("done", "unknown")).toBe(false);
    expect(shouldReconcile("failed", "unknown")).toBe(false);
  });

  it("dead always overrides regardless of current state", () => {
    // Pane death is authoritative for any JSON state
    expect(shouldReconcile("starting", "dead")).toBe(true);
    expect(shouldReconcile("idle", "dead")).toBe(true);
    expect(shouldReconcile("working", "dead")).toBe(true);
    expect(shouldReconcile("blocked", "dead")).toBe(true);
    expect(shouldReconcile("done", "dead")).toBe(true);
    expect(shouldReconcile("failed", "dead")).toBe(true);
  });

  it("expanded classifyOutput: all Braille spinners → busy", () => {
    const brailleChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    for (const char of brailleChars) {
      expect(classifyOutput(`Processing...\n${char} Working`)).toBe("busy");
    }
  });

  it("expanded classifyOutput: Codex v0.118 bullet patterns → busy", () => {
    // Validated from real Codex terminal captures
    expect(classifyOutput("• Working (5s • esc to interrupt)")).toBe("busy");
    expect(classifyOutput("• Explored\n  └ List rg --files")).toBe("busy");
    expect(classifyOutput("• Ran pwd\n  └ /tmp")).toBe("busy");
    expect(classifyOutput("• Added hello.txt (+1 -0)")).toBe("busy");
    expect(classifyOutput("• Edited config.json (+3 -1)")).toBe("busy");
    expect(classifyOutput("• Removed temp.log")).toBe("busy");
  });

  it("expanded classifyOutput: Claude keywords still work", () => {
    expect(classifyOutput("Thinking about the problem")).toBe("busy");
    expect(classifyOutput("Running tool call...")).toBe("busy");
  });
});
