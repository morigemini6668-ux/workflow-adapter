import { Box, Text } from 'ink';

interface StatusBarProps {
  activePanel: string;
  sessionName?: string;
  agentCount: number;
  taskCount: number;
}

export function StatusBar({ activePanel, sessionName, agentCount, taskCount }: StatusBarProps) {
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <Text>
        <Text dimColor>q</Text><Text>:quit  </Text>
        <Text dimColor>Tab</Text><Text>:switch  </Text>
        <Text dimColor>r</Text><Text>:refresh  </Text>
        <Text dimColor>f</Text><Text>:filter</Text>
      </Text>
      <Text dimColor>
        {sessionName ? `${sessionName} | ` : ''}
        agents:{agentCount} tasks:{taskCount} [{activePanel}]
      </Text>
    </Box>
  );
}
