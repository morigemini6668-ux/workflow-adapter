import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type { AgentState, Event, Task } from "../lib/types.js";
import { AgentList } from "./AgentList.js";
import { EventFeed } from "./EventFeed.js";
import { StatusBar } from "./StatusBar.js";
import { TaskList } from "./TaskList.js";

// ── Data Fetcher Interface ────────────────────────────────────────────

export interface TuiDataSource {
  fetchAgents(): Promise<AgentState[]>;
  fetchTasks(): Promise<Task[]>;
  fetchEvents(): Promise<Event[]>;
  getSessionName(): string | undefined;
}

// ── Panels ────────────────────────────────────────────────────────────

const PANELS = ["agents", "tasks", "events"] as const;
type Panel = (typeof PANELS)[number];

// ── App ───────────────────────────────────────────────────────────────

interface AppProps {
  dataSource: TuiDataSource;
  refreshInterval?: number;
}

export function App({ dataSource, refreshInterval = 2000 }: AppProps) {
  const { exit } = useApp();

  const [agents, setAgents] = useState<AgentState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>("agents");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // ── Data Refresh ──────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const [a, t, e] = await Promise.all([
        dataSource.fetchAgents(),
        dataSource.fetchTasks(),
        dataSource.fetchEvents(),
      ]);
      setAgents(a);
      setTasks(t);
      setEvents(e);
      setError(undefined);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  }, [dataSource]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [refresh, refreshInterval]);

  // ── Keyboard Input ────────────────────────────────────────────────

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (key.tab) {
      setActivePanel((current) => {
        const idx = PANELS.indexOf(current);
        return PANELS[(idx + 1) % PANELS.length];
      });
      return;
    }

    if (input === "r") {
      refresh();
      return;
    }

    if (input === "f") {
      // Cycle through task status filters
      if (activePanel === "tasks") {
        setStatusFilter((current) => {
          if (!current) return "pending";
          if (current === "pending") return "in_progress";
          if (current === "in_progress") return "completed";
          if (current === "completed") return "failed";
          return undefined;
        });
      }
      return;
    }
  });

  // ── Render ────────────────────────────────────────────────────────

  const sessionName = dataSource.getSessionName();

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box paddingLeft={1} paddingRight={1}>
        <Text bold color="cyan">
          uniflow
        </Text>
        <Text dimColor> v0.1.0</Text>
        {sessionName && <Text dimColor> — {sessionName}</Text>}
        <Text dimColor>
          {" "}
          (refreshed {lastRefresh.toLocaleTimeString("en-GB", { hour12: false })})
        </Text>
      </Box>

      {/* Error banner */}
      {error && (
        <Box paddingLeft={1} paddingRight={1}>
          <Text color="red" bold>
            Error: {error}
          </Text>
        </Box>
      )}

      {/* Main panels (agents + tasks side by side) */}
      <Box flexDirection="row" flexGrow={1}>
        <AgentList agents={agents} focused={activePanel === "agents"} />
        <TaskList tasks={tasks} focused={activePanel === "tasks"} statusFilter={statusFilter} />
      </Box>

      {/* Event feed */}
      <EventFeed events={events} focused={activePanel === "events"} />

      {/* Status bar */}
      <StatusBar
        activePanel={activePanel}
        sessionName={sessionName}
        agentCount={agents.length}
        taskCount={tasks.length}
      />
    </Box>
  );
}
