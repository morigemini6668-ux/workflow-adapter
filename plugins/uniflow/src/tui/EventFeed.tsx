import { Box, Text } from "ink";
import type { Event } from "../lib/types.js";

interface EventFeedProps {
  events: Event[];
  focused: boolean;
  maxLines?: number;
}

const TYPE_COLORS: Record<string, string> = {
  session_started: "green",
  session_stopped: "yellow",
  agent_spawned: "cyan",
  agent_killed: "red",
  agent_crashed: "red",
  agent_status_change: "blue",
  agent_nudged: "yellow",
  agent_respawned: "cyan",
  task_created: "white",
  task_assigned: "blue",
  task_completed: "green",
  task_failed: "red",
  message_sent: "white",
  inbox_written: "white",
  error: "red",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function formatEventData(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.join(" ");
}

export function EventFeed({ events, focused, maxLines = 8 }: EventFeedProps) {
  const recent = events.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? "bold" : "single"}
      borderColor={focused ? "cyan" : undefined}
      paddingLeft={1}
      paddingRight={1}
      height={maxLines + 3}
    >
      <Text bold underline>
        {" "}
        Events{" "}
      </Text>
      {recent.length === 0 ? (
        <Text dimColor> No events</Text>
      ) : (
        recent.map((event, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: event feed has no stable unique id
          <Box key={`${event.ts}-${event.type}-${i}`} flexDirection="row" gap={1}>
            <Text dimColor>{formatTime(event.ts)}</Text>
            <Text color={TYPE_COLORS[event.type] ?? "white"}>{event.type}</Text>
            <Text dimColor>{formatEventData(event.data)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
