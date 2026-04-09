import { describe, expect, it } from "bun:test";
import { shouldReconcile, toAgentState } from "../src/daemon/monitor.js";
import type { AgentStateName } from "../src/lib/types.js";
import type { PaneState } from "../src/daemon/tmux.js";

describe("shouldReconcile", () => {
  const cases: [AgentStateName, PaneState, boolean, string][] = [
    ["idle", "busy", true, "Rule 2: idle → busy ALLOW"],
    ["idle", "idle", false, "Rule 4: same → same SKIP"],
    ["working", "busy", false, "Rule 5: working → busy SKIP"],
    ["working", "idle", true, "Rule 3: working finished"],
    ["idle", "unknown", false, "Rule 1: never overwrite with unknown"],
    ["working", "dead", true, "Rule 6: death is authoritative"],
    // Rule 7: protected states — daemon must not overwrite
    ["blocked", "idle", false, "Rule 7: blocked is protected"],
    ["blocked", "busy", false, "Rule 7: blocked is protected from busy"],
    ["done", "idle", false, "Rule 7: done is protected"],
    ["failed", "busy", false, "Rule 7: failed is protected"],
    // Rule 6 overrides Rule 7 — dead is always authoritative
    ["blocked", "dead", true, "Rule 6 > Rule 7: dead overrides blocked"],
    ["done", "dead", true, "Rule 6 > Rule 7: dead overrides done"],
    ["failed", "dead", true, "Rule 6 > Rule 7: dead overrides failed"],
  ];

  for (const [jsonState, paneState, expected, label] of cases) {
    it(label, () => {
      expect(shouldReconcile(jsonState, paneState)).toBe(expected);
    });
  }
});

describe("toAgentState", () => {
  it("maps busy → working", () => {
    expect(toAgentState("busy")).toBe("working");
  });

  it("maps dead → failed", () => {
    expect(toAgentState("dead")).toBe("failed");
  });

  it("maps idle → idle", () => {
    expect(toAgentState("idle")).toBe("idle");
  });
});
