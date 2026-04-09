import { parseArgs, sendCommand } from "./client.js";

export default async function tasks(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const json = flags.json === true;
  const statusFilter = flags.status as string | undefined;

  const response = await sendCommand("tasks", statusFilter ? { status: statusFilter } : {});

  if (!response.success) {
    console.error(`Error: ${response.error}`);
    process.exit(1);
  }

  const data = response.data as {
    id: string;
    subject: string;
    status: string;
    assignee: string | null;
    priority: number;
    depends_on: string[];
  }[];

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.length === 0) {
    console.log("No tasks.");
    return;
  }

  console.log(
    `${"ID".padEnd(15) + "P".padEnd(4) + "Status".padEnd(14) + "Assignee".padEnd(16)}Subject`,
  );
  console.log("-".repeat(80));
  for (const t of data) {
    const assignee = t.assignee ?? "-";
    console.log(
      t.id.padEnd(15) +
        `${t.priority}`.padEnd(4) +
        t.status.padEnd(14) +
        assignee.padEnd(16) +
        t.subject,
    );
  }
}
