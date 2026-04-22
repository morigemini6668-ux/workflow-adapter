import { parseArgs, sendCommand } from "./client.js";

export default async function status(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const json = flags.json === true;
  const watch = flags.watch === true;
  const peek = flags.peek === true;

  const printStatus = async () => {
    const response = await sendCommand("status", { peek });

    if (!response.success) {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }

    if (json) {
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }

    const data = response.data as {
      session: { id: string; project: string; status: string; cwd: string };
      agents: {
        name: string;
        cli: string;
        role: string;
        state: string;
        current_task: string | null;
        progress: string | null;
      }[];
      tasks: {
        id: string;
        subject: string;
        status: string;
        assignee: string | null;
        priority: number;
      }[];
      recent_results: unknown[];
    };

    console.log(`Session: ${data.session.project} (${data.session.id.slice(0, 8)})`);
    console.log(`Status: ${data.session.status}`);
    console.log(`CWD: ${data.session.cwd}\n`);

    // Agents
    console.log("Agents:");
    if (data.agents.length === 0) {
      console.log("  (none)");
    } else {
      for (const a of data.agents) {
        const task = a.current_task ? ` [${a.current_task}]` : "";
        const progress = a.progress ? ` — ${a.progress}` : "";
        console.log(`  ${a.name} (${a.cli}/${a.role}): ${a.state}${task}${progress}`);
      }
    }

    // Tasks
    console.log("\nTasks:");
    if (data.tasks.length === 0) {
      console.log("  (none)");
    } else {
      for (const t of data.tasks) {
        const assignee = t.assignee ? ` → ${t.assignee}` : "";
        console.log(`  [P${t.priority}] ${t.id}: ${t.subject} (${t.status})${assignee}`);
      }
    }
  };

  if (watch) {
    while (true) {
      console.clear();
      await printStatus();
      await new Promise((r) => setTimeout(r, 2000));
    }
  } else {
    await printStatus();
  }
}
