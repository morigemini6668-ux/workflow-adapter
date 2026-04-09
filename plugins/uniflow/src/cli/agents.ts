import { parseArgs, sendCommand } from "./client.js";

export default async function agents(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const json = flags.json === true;

  const response = await sendCommand("agents");

  if (!response.success) {
    console.error(`Error: ${response.error}`);
    process.exit(1);
  }

  const data = response.data as {
    name: string;
    cli: string;
    role: string;
    state: string;
    current_task: string | null;
    pane_id: string;
  }[];

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.length === 0) {
    console.log("No agents running.");
    return;
  }

  console.log(
    `${"Name".padEnd(20) + "CLI".padEnd(8) + "Role".padEnd(14) + "State".padEnd(10)}Task`,
  );
  console.log("-".repeat(70));
  for (const a of data) {
    const task = a.current_task ?? "-";
    console.log(
      a.name.padEnd(20) + a.cli.padEnd(8) + a.role.padEnd(14) + a.state.padEnd(10) + task,
    );
  }
}
