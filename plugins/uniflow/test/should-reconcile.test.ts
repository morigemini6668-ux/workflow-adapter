import { describe, expect, it } from "bun:test";
import { shouldReconcile } from "../src/daemon/monitor.js";
import type { AgentStateName } from "../src/lib/types.js";
import type { PaneState } from "../src/daemon/tmux.js";

describe("shouldReconcile", () => {
  const cases: [AgentStateName, PaneState, boolean, string][] = [
    ["idle", "busy", true, "Rule 2: idle → busy ALLOW"],
    ["busy", "idle", true, "Rule 3: busy → idle ALLOW"],
    ["idle", "idle", false, "Rule 4: same → same SKIP"],
    ["working", "busy", false, "Rule 5: working → busy SKIP"],
    ["working", "idle", true, "Rule 3: working finished"],
    ["idle", "unknown", false, "Rule 1: never overwrite with unknown"],
    ["working", "dead", true, "Rule 6: death is authoritative"],
  ];

  for (const [jsonState, paneState, expected, label] of cases) {
    it(label, () => {
      expect(shouldReconcile(jsonState, paneState)).toBe(expected);
    });
  }
});
