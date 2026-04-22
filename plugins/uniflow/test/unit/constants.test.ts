import { describe, expect, it } from "bun:test";
import {
  projectDir,
  sessionDir,
  agentsDir,
  inboxesDir,
  tasksDir,
  logsDir,
  socketPath,
  archiveDir,
  tmuxSessionName,
  MAX_WORKERS,
  TMUX_MIN_VERSION,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_SESSION_EXISTS,
  EXIT_AGENT_NOT_FOUND,
  EXIT_TMUX_MISSING,
} from "../../src/lib/constants.js";

describe("path helpers", () => {
  it("projectDir ends with project name", () => {
    expect(projectDir("myproj")).toMatch(/\.uniflow\/projects\/myproj$/);
  });

  it("sessionDir includes project and session", () => {
    const p = sessionDir("p", "s1");
    expect(p).toContain("projects/p/sessions/s1");
  });

  it("agentsDir ends with agents", () => {
    expect(agentsDir("p", "s")).toEndWith("sessions/s/agents");
  });

  it("inboxesDir ends with inboxes", () => {
    expect(inboxesDir("p", "s")).toEndWith("sessions/s/inboxes");
  });

  it("tasksDir ends with tasks", () => {
    expect(tasksDir("p", "s")).toEndWith("sessions/s/tasks");
  });

  it("logsDir ends with logs", () => {
    expect(logsDir("p", "s")).toEndWith("sessions/s/logs");
  });

  it("socketPath ends with .sock", () => {
    expect(socketPath("proj")).toMatch(/sockets\/proj\.sock$/);
  });

  it("archiveDir includes archive and session", () => {
    expect(archiveDir("p", "s")).toContain("archive/s");
  });

  it("tmuxSessionName prefixes with uniflow-", () => {
    expect(tmuxSessionName("proj")).toBe("uniflow-proj");
  });
});

describe("constants", () => {
  it("MAX_WORKERS is 5", () => {
    expect(MAX_WORKERS).toBe(5);
  });

  it("TMUX_MIN_VERSION is 3.3", () => {
    expect(TMUX_MIN_VERSION).toBe("3.3");
  });

  it("exit codes are distinct", () => {
    const codes = [EXIT_OK, EXIT_ERROR, EXIT_SESSION_EXISTS, EXIT_AGENT_NOT_FOUND, EXIT_TMUX_MISSING];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
