import { describe, expect, it } from "bun:test";
import {
  AgentStateSchema,
  TaskSchema,
  SessionSchema,
  SessionAgentSchema,
  GlobalConfigSchema,
  DaemonRequestSchema,
  DispatchOptionsSchema,
  OutboxEntrySchema,
  EventSchema,
} from "../../src/lib/types.js";
import {
  makeAgentState,
  makeTask,
  makeSession,
  makeSessionAgent,
  makeOutboxEntry,
  makeEvent,
} from "../helpers/fixtures.js";

describe("AgentStateSchema", () => {
  it("accepts valid agent state", () => {
    const result = AgentStateSchema.safeParse(makeAgentState());
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name, ...rest } = makeAgentState();
    expect(AgentStateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid state enum", () => {
    const result = AgentStateSchema.safeParse(makeAgentState({ state: "sleeping" as any }));
    expect(result.success).toBe(false);
  });

  it("rejects non-number pid", () => {
    const result = AgentStateSchema.safeParse(makeAgentState({ pid: "abc" as any }));
    expect(result.success).toBe(false);
  });

  it("rejects non-datetime started_at", () => {
    const result = AgentStateSchema.safeParse(makeAgentState({ started_at: "not-a-date" }));
    expect(result.success).toBe(false);
  });
});

describe("TaskSchema", () => {
  it("accepts valid task", () => {
    expect(TaskSchema.safeParse(makeTask()).success).toBe(true);
  });

  it("rejects priority < 1", () => {
    expect(TaskSchema.safeParse(makeTask({ priority: 0 })).success).toBe(false);
  });

  it("rejects priority > 5", () => {
    expect(TaskSchema.safeParse(makeTask({ priority: 6 })).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(TaskSchema.safeParse(makeTask({ status: "running" as any })).success).toBe(false);
  });

  it("accepts empty depends_on", () => {
    expect(TaskSchema.safeParse(makeTask({ depends_on: [] })).success).toBe(true);
  });
});

describe("SessionAgentSchema", () => {
  it("accepts valid session agent", () => {
    expect(SessionAgentSchema.safeParse(makeSessionAgent()).success).toBe(true);
  });

  it("accepts optional roleFile", () => {
    const result = SessionAgentSchema.safeParse(makeSessionAgent({ roleFile: "/tmp/role.md" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roleFile).toBe("/tmp/role.md");
  });

  it("accepts missing roleFile", () => {
    const agent = makeSessionAgent();
    expect(SessionAgentSchema.safeParse(agent).success).toBe(true);
  });
});

describe("SessionSchema", () => {
  it("accepts valid session", () => {
    expect(SessionSchema.safeParse(makeSession()).success).toBe(true);
  });

  it("defaults here to false", () => {
    const { here, ...rest } = makeSession();
    const result = SessionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.here).toBe(false);
  });

  it("defaults pluginDirs to empty array", () => {
    const { pluginDirs, ...rest } = makeSession();
    const result = SessionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pluginDirs).toEqual([]);
  });

  it("accepts pluginDirs with values", () => {
    const result = SessionSchema.safeParse(makeSession({ pluginDirs: ["/a", "/b"] }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pluginDirs).toEqual(["/a", "/b"]);
  });

  it("rejects invalid status", () => {
    expect(SessionSchema.safeParse(makeSession({ status: "running" as any })).success).toBe(false);
  });
});

describe("GlobalConfigSchema", () => {
  it("applies all defaults for empty object", () => {
    const result = GlobalConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_cli).toBe("claude");
      expect(result.data.default_worker_count).toBe(2);
      expect(result.data.nudge_delay_ms).toBe(30000);
    }
  });

  it("rejects worker_count > 5", () => {
    expect(GlobalConfigSchema.safeParse({ default_worker_count: 6 }).success).toBe(false);
  });

  it("rejects worker_count < 1", () => {
    expect(GlobalConfigSchema.safeParse({ default_worker_count: 0 }).success).toBe(false);
  });
});

describe("DaemonRequestSchema", () => {
  it("accepts valid request", () => {
    const result = DaemonRequestSchema.safeParse({
      command: "spawn",
      args: { name: "w1" },
      requestId: "req-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing command", () => {
    expect(DaemonRequestSchema.safeParse({ args: {}, requestId: "r" }).success).toBe(false);
  });
});

describe("DispatchOptionsSchema", () => {
  it("accepts valid dispatch", () => {
    const result = DispatchOptionsSchema.safeParse({ mode: "nudge", message: "hello" });
    expect(result.success).toBe(true);
  });

  it("rejects message > 60 chars", () => {
    const result = DispatchOptionsSchema.safeParse({ mode: "nudge", message: "x".repeat(61) });
    expect(result.success).toBe(false);
  });
});

describe("OutboxEntrySchema", () => {
  it("accepts valid entry", () => {
    expect(OutboxEntrySchema.safeParse(makeOutboxEntry()).success).toBe(true);
  });
});

describe("EventSchema", () => {
  it("accepts valid event", () => {
    expect(EventSchema.safeParse(makeEvent()).success).toBe(true);
  });

  it("rejects invalid event type", () => {
    expect(EventSchema.safeParse(makeEvent({ type: "unknown" as any })).success).toBe(false);
  });
});
