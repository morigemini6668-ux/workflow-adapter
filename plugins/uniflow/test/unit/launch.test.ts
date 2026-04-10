import { describe, expect, it } from "bun:test";
import {
  renderTemplate,
  buildOrchestratorVars,
  buildWorkerVars,
  buildLaunchCommand,
  type LaunchOptions,
} from "../../src/launch/index.js";
import { buildClaudeCommand } from "../../src/launch/claude.js";
import { buildCodexCommand } from "../../src/launch/codex.js";
import { sessionDir } from "../../src/lib/constants.js";

describe("renderTemplate", () => {
  it("replaces {{VAR}} with value", () => {
    const result = renderTemplate("Hello {{PROJECT_NAME}}", { PROJECT_NAME: "test", SESSION_ID: "", STATE_DIR: "" });
    expect(result).toBe("Hello test");
  });

  it("leaves unmatched {{UNKNOWN}} as-is", () => {
    const result = renderTemplate("{{UNKNOWN}}", { PROJECT_NAME: "test", SESSION_ID: "", STATE_DIR: "" });
    expect(result).toBe("{{UNKNOWN}}");
  });

  it("replaces multiple vars", () => {
    const result = renderTemplate("{{PROJECT_NAME}}/{{SESSION_ID}}", {
      PROJECT_NAME: "proj",
      SESSION_ID: "s1",
      STATE_DIR: "",
    });
    expect(result).toBe("proj/s1");
  });

  it("handles empty string values", () => {
    const result = renderTemplate("role={{ROLE_INSTRUCTIONS}}", {
      PROJECT_NAME: "",
      SESSION_ID: "",
      STATE_DIR: "",
      ROLE_INSTRUCTIONS: "",
    });
    expect(result).toBe("role=");
  });
});

describe("buildOrchestratorVars", () => {
  it("returns correct fields", () => {
    const vars = buildOrchestratorVars("proj", "s1");
    expect(vars.PROJECT_NAME).toBe("proj");
    expect(vars.SESSION_ID).toBe("s1");
    expect(vars.STATE_DIR).toBe(sessionDir("proj", "s1"));
  });
});

describe("buildWorkerVars", () => {
  it("returns all expected fields", () => {
    const vars = buildWorkerVars("proj", "s1", "w1", "claude", "executor", "%10", 123);
    expect(vars.PROJECT_NAME).toBe("proj");
    expect(vars.WORKER_NAME).toBe("w1");
    expect(vars.ROLE).toBe("executor");
    expect(vars.CLI).toBe("claude");
    expect(vars.PID).toBe("123");
  });

  it("INBOX_PATH ends with worker name", () => {
    const vars = buildWorkerVars("p", "s", "w1", "claude", "exec", "%1", 1);
    expect(vars.INBOX_PATH).toEndWith("w1.md");
  });

  it("OUTBOX_PATH ends with outbox.jsonl", () => {
    const vars = buildWorkerVars("p", "s", "w1", "claude", "exec", "%1", 1);
    expect(vars.OUTBOX_PATH).toEndWith("outbox.jsonl");
  });

  it("defaults roleInstructions to empty string", () => {
    const vars = buildWorkerVars("p", "s", "w1", "claude", "exec", "%1", 1);
    expect(vars.ROLE_INSTRUCTIONS).toBe("");
  });

  it("uses provided roleInstructions", () => {
    const vars = buildWorkerVars("p", "s", "w1", "claude", "exec", "%1", 1, "custom instructions");
    expect(vars.ROLE_INSTRUCTIONS).toBe("custom instructions");
  });
});

describe("buildClaudeCommand", () => {
  const base: LaunchOptions = {
    name: "w1",
    cli: "claude",
    role: "executor",
    mode: "interactive",
    cwd: "/tmp",
    instructionPath: "/tmp/instr.md",
  };

  it("starts with claude", () => {
    const cmd = buildClaudeCommand(base);
    expect(cmd[0]).toBe("claude");
  });

  it("interactive mode has no -p flag", () => {
    const cmd = buildClaudeCommand(base);
    expect(cmd).not.toContain("-p");
  });

  it("non_interactive mode includes -p and --bare", () => {
    const cmd = buildClaudeCommand({ ...base, mode: "non_interactive" });
    expect(cmd).toContain("-p");
    expect(cmd).toContain("--bare");
  });

  it("includes --dangerously-skip-permissions", () => {
    const cmd = buildClaudeCommand(base);
    expect(cmd).toContain("--dangerously-skip-permissions");
  });

  it("includes --append-system-prompt-file with instruction path", () => {
    const cmd = buildClaudeCommand(base);
    const idx = cmd.indexOf("--append-system-prompt-file");
    expect(idx).toBeGreaterThan(-1);
    expect(cmd[idx + 1]).toBe("/tmp/instr.md");
  });

  it("includes --name with uniflow prefix", () => {
    const cmd = buildClaudeCommand(base);
    const idx = cmd.indexOf("--name");
    expect(cmd[idx + 1]).toBe("uniflow-w1");
  });

  it("adds multiple --plugin-dir for pluginDirs", () => {
    const cmd = buildClaudeCommand({ ...base, pluginDirs: ["/a", "/b"] });
    const dirs = cmd.reduce<string[]>((acc, arg, i) => {
      if (arg === "--plugin-dir" && cmd[i + 1]) acc.push(cmd[i + 1]);
      return acc;
    }, []);
    expect(dirs).toEqual(["/a", "/b"]);
  });

  it("omits --plugin-dir when pluginDirs is undefined", () => {
    const cmd = buildClaudeCommand(base);
    expect(cmd).not.toContain("--plugin-dir");
  });
});

describe("buildCodexCommand", () => {
  const base: LaunchOptions = {
    name: "w1",
    cli: "codex",
    role: "executor",
    mode: "interactive",
    cwd: "/tmp",
    instructionPath: "/tmp/instr.md",
  };

  it("starts with codex", () => {
    const cmd = buildCodexCommand(base);
    expect(cmd[0]).toBe("codex");
  });

  it("includes --dangerously-bypass-approvals-and-sandbox", () => {
    const cmd = buildCodexCommand(base);
    expect(cmd).toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});

describe("buildLaunchCommand", () => {
  it("delegates to claude for cli=claude", () => {
    const cmd = buildLaunchCommand({
      name: "w1", cli: "claude", role: "exec", mode: "interactive",
      cwd: "/tmp", instructionPath: "/tmp/i.md",
    });
    expect(cmd[0]).toBe("claude");
  });

  it("delegates to codex for cli=codex", () => {
    const cmd = buildLaunchCommand({
      name: "w1", cli: "codex", role: "exec", mode: "interactive",
      cwd: "/tmp", instructionPath: "/tmp/i.md",
    });
    expect(cmd[0]).toBe("codex");
  });

  it("throws for unsupported CLI", () => {
    expect(() =>
      buildLaunchCommand({
        name: "w1", cli: "unknown" as any, role: "exec", mode: "interactive",
        cwd: "/tmp", instructionPath: "/tmp/i.md",
      }),
    ).toThrow("Unsupported CLI");
  });
});
