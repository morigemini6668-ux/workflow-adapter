import { Box, Text } from 'ink';
import type { Task } from '../lib/types.js';

interface TaskListProps {
  tasks: Task[];
  focused: boolean;
  statusFilter?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  in_progress: 'blue',
  completed: 'green',
  failed: 'red',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  completed: '[x]',
  failed: '[!]',
};

/** Truncate string to width, adding ellipsis if needed */
function trunc(s: string, w: number): string {
  if (s.length <= w) return s.padEnd(w);
  return s.slice(0, w - 1) + '\u2026';
}

export function TaskList({ tasks, focused, statusFilter }: TaskListProps) {
  const filtered = statusFilter
    ? tasks.filter((t) => t.status === statusFilter)
    : tasks;

  return (
    <Box flexDirection="column" borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? 'cyan' : undefined} paddingLeft={1} paddingRight={1} flexGrow={1} overflowX="hidden">
      <Box flexDirection="row" gap={1}>
        <Text bold underline> Tasks </Text>
        {statusFilter && <Text dimColor>({statusFilter})</Text>}
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>  No tasks</Text>
      ) : (
        <>
          <Box flexDirection="row" gap={1}>
            <Text dimColor bold>{trunc('ID', 10)}</Text>
            <Text dimColor bold>{trunc('STATUS', 12)}</Text>
            <Text dimColor bold>{trunc('ASSIGNEE', 12)}</Text>
            <Text dimColor bold>SUBJECT</Text>
          </Box>
          {filtered.map((task) => (
            <Box key={task.id} flexDirection="row" gap={1}>
              <Text>{trunc(task.id, 10)}</Text>
              <Text color={STATUS_COLORS[task.status] ?? 'white'}>
                {STATUS_ICONS[task.status] ?? '???'} {trunc(task.status, 12)}
              </Text>
              <Text dimColor>{trunc(task.assignee ?? '-', 12)}</Text>
              <Text>{trunc(task.subject, 30)}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
