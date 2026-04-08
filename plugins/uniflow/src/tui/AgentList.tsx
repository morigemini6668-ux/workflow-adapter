import { Box, Text } from 'ink';
import type { AgentState } from '../lib/types.js';

interface AgentListProps {
  agents: AgentState[];
  focused: boolean;
}

const STATE_COLORS: Record<string, string> = {
  starting: 'yellow',
  idle: 'green',
  working: 'blue',
  blocked: 'red',
  done: 'gray',
  failed: 'red',
};

const STATE_ICONS: Record<string, string> = {
  starting: '...',
  idle: '---',
  working: '>>>',
  blocked: '!!!',
  done: 'ok ',
  failed: 'ERR',
};

export function AgentList({ agents, focused }: AgentListProps) {
  return (
    <Box flexDirection="column" borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? 'cyan' : undefined} paddingLeft={1} paddingRight={1} flexGrow={1}>
      <Text bold underline> Agents </Text>
      {agents.length === 0 ? (
        <Text dimColor>  No agents</Text>
      ) : (
        <>
          <Box flexDirection="row" gap={1}>
            <Text dimColor bold>{'NAME'.padEnd(16)}</Text>
            <Text dimColor bold>{'CLI'.padEnd(7)}</Text>
            <Text dimColor bold>{'STATE'.padEnd(10)}</Text>
            <Text dimColor bold>TASK</Text>
          </Box>
          {agents.map((agent) => (
            <Box key={agent.name} flexDirection="row" gap={1}>
              <Text>{agent.name.padEnd(16)}</Text>
              <Text dimColor>{agent.cli.padEnd(7)}</Text>
              <Text color={STATE_COLORS[agent.state] ?? 'white'}>
                {STATE_ICONS[agent.state] ?? '???'} {agent.state.padEnd(10)}
              </Text>
              <Text dimColor>{agent.current_task ?? '-'}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
