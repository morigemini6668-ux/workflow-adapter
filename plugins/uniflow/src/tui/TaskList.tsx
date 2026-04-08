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

export function TaskList({ tasks, focused, statusFilter }: TaskListProps) {
  const filtered = statusFilter
    ? tasks.filter((t) => t.status === statusFilter)
    : tasks;

  return (
    <Box flexDirection="column" borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? 'cyan' : undefined} paddingLeft={1} paddingRight={1} flexGrow={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold underline> Tasks </Text>
        {statusFilter && <Text dimColor>({statusFilter})</Text>}
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>  No tasks</Text>
      ) : (
        <>
          <Box flexDirection="row" gap={1}>
            <Text dimColor bold>{'ID'.padEnd(12)}</Text>
            <Text dimColor bold>{'STATUS'.padEnd(14)}</Text>
            <Text dimColor bold>{'ASSIGNEE'.padEnd(14)}</Text>
            <Text dimColor bold>SUBJECT</Text>
          </Box>
          {filtered.map((task) => (
            <Box key={task.id} flexDirection="row" gap={1}>
              <Text>{task.id.padEnd(12)}</Text>
              <Text color={STATUS_COLORS[task.status] ?? 'white'}>
                {STATUS_ICONS[task.status] ?? '???'} {task.status.padEnd(14)}
              </Text>
              <Text dimColor>{(task.assignee ?? '-').padEnd(14)}</Text>
              <Text>{task.subject.slice(0, 40)}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
