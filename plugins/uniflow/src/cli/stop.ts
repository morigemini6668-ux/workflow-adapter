import { sendCommand } from './client.js';

export default async function stop(_args: string[]): Promise<void> {
  const response = await sendCommand('stop');

  if (response.success) {
    console.log('Session stopped and archived.');
  } else {
    console.error(`Failed to stop: ${response.error}`);
    process.exit(1);
  }
}
