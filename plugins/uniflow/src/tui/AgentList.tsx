import { Box, Text } from "ink";
import type { AgentState } from "../lib/types.js";

interface AgentListProps {
  agents: AgentState[];
  focused: boolean;
}

const STATE_COLORS: Record<string, string> = {
  starting: "yellow",
  idle: "green",
  working: "blue",
  blocked: "red",
  done: "gray",
  failed: "red",
};

const STATE_ICONS: Record<string, string> = {
  starting: "...",
  idle: "---",
  working: ">>>",
  blocked: "!!!",
  done: "ok ",
  failed: "ERR",
};

/** Truncate string to width, adding ellipsis if needed */
function trunc(s: string, w: number): string {
  if (s.length <= w) return s.padEnd(w);
  return `${s.slice(0, w - 1)}\u2026`;
}

export function AgentList({ agents, focused }: AgentListProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? "bold" : "single"}
      borderColor={focused ? "cyan" : undefined}
      paddingLeft={1}
      paddingRight={1}
      flexGrow={1}
      overflowX="hidden"
    >
      <Text bold underline>
        {" "}
        Agents{" "}
      </Text>
      {agents.length === 0 ? (
        <Text dimColor> No agents</Text>
      ) : (
        <>
          <Box flexDirection="row" gap={1}>
            <Text dimColor bold>
              {trunc("NAME", 14)}
            </Text>
            <Text dimColor bold>
              {trunc("CLI", 6)}
            </Text>
            <Text dimColor bold>
              {trunc("STATE", 10)}
            </Text>
            <Text dimColor bold>
              TASK
            </Text>
          </Box>
          {agents.map((agent) => (
            <Box key={agent.name} flexDirection="row" gap={1}>
              <Text>{trunc(agent.name, 14)}</Text>
              <Text dimColor>{trunc(agent.cli, 6)}</Text>
              <Text color={STATE_COLORS[agent.state] ?? "white"}>
                {STATE_ICONS[agent.state] ?? "???"} {trunc(agent.state, 10)}
              </Text>
              <Text dimColor>{trunc(agent.current_task ?? "-", 12)}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
