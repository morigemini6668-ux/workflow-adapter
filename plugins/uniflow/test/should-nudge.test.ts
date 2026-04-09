import { describe, expect, test } from "bun:test";
import { shouldNudge } from "../src/daemon/dispatch.js";

describe("shouldNudge", () => {
  test("idle → true (nudge allowed)", () => {
    expect(shouldNudge("idle")).toBe(true);
  });

  test("busy → false (agent is working)", () => {
    expect(shouldNudge("busy")).toBe(false);
  });

  test("unknown → false (cannot confirm idle)", () => {
    expect(shouldNudge("unknown")).toBe(false);
  });

  test("dead → false (pane is dead)", () => {
    expect(shouldNudge("dead")).toBe(false);
  });
});
