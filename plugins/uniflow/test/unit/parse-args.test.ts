import { describe, expect, it } from "bun:test";
import { parseArgs } from "../../src/cli/client.js";

describe("parseArgs", () => {
  it("returns empty for no args", () => {
    const result = parseArgs([]);
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
  });

  it("collects positional args", () => {
    const result = parseArgs(["spawn", "w1"]);
    expect(result.positional).toEqual(["spawn", "w1"]);
    expect(result.flags).toEqual({});
  });

  it("parses --key value", () => {
    const result = parseArgs(["--cli", "claude"]);
    expect(result.flags.cli).toBe("claude");
  });

  it("parses --key=value", () => {
    const result = parseArgs(["--cli=claude"]);
    expect(result.flags.cli).toBe("claude");
  });

  it("parses --flag as boolean true", () => {
    const result = parseArgs(["--force"]);
    expect(result.flags.force).toBe(true);
  });

  it("parses short -k with value", () => {
    const result = parseArgs(["-n", "50"]);
    expect(result.flags.n).toBe("50");
  });

  it("parses short -f as boolean", () => {
    const result = parseArgs(["-f"]);
    expect(result.flags.f).toBe(true);
  });

  it("handles mixed args", () => {
    const result = parseArgs(["spawn", "w1", "--cli", "claude", "--force"]);
    expect(result.positional).toEqual(["spawn", "w1"]);
    expect(result.flags.cli).toBe("claude");
    expect(result.flags.force).toBe(true);
  });

  it("long boolean flag consumes short flag as value (known behavior)", () => {
    // parseArgs long flags check !next.startsWith("--"), so -n is consumed as value
    const result = parseArgs(["--force", "-n"]);
    expect(result.flags.force).toBe("-n");
  });

  it("treats --key followed by --key as boolean", () => {
    const result = parseArgs(["--force", "--json"]);
    expect(result.flags.force).toBe(true);
    expect(result.flags.json).toBe(true);
  });

  it("handles --key=empty as empty string", () => {
    const result = parseArgs(["--name="]);
    expect(result.flags.name).toBe("");
  });

  it("treats --key at end of args as boolean", () => {
    const result = parseArgs(["spawn", "--verbose"]);
    expect(result.positional).toEqual(["spawn"]);
    expect(result.flags.verbose).toBe(true);
  });
});
