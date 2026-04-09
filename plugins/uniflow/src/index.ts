#!/usr/bin/env bun

const VERSION = "0.1.0";

const COMMANDS: Record<string, { description: string; usage?: string }> = {
  init: { description: "Initialize .uniflow-id in current project", usage: "uniflow init" },
  doctor: { description: "Check prerequisites (tmux, CLI tools, etc.)", usage: "uniflow doctor" },
  install: {
    description: "Install uniflow plugin for Claude Code / Codex",
    usage: "uniflow install",
  },
  start: {
    description: "Start daemon + orchestrator session",
    usage: "uniflow start [--cli claude|codex] [--tui]",
  },
  stop: { description: "Stop session and archive", usage: "uniflow stop [--force]" },
  status: { description: "Show session status", usage: "uniflow status [--json] [--watch]" },
  spawn: {
    description: "Spawn a worker agent",
    usage:
      "uniflow spawn <name> [--cli claude|codex] [--role executor] [--mode interactive|non_interactive]",
  },
  send: {
    description: "Send message to agent inbox",
    usage: "uniflow send <agent> <message> [--interrupt|--nudge]",
  },
  assign: { description: "Assign task to agent", usage: "uniflow assign <task-id> <agent>" },
  "task-add": {
    description: "Create a new task",
    usage: "uniflow task-add <subject> [--assign agent] [--priority 1-5] [--depends-on id,id]",
  },
  agents: { description: "List agents", usage: "uniflow agents" },
  tasks: {
    description: "List tasks",
    usage: "uniflow tasks [--status pending|in_progress|completed|failed]",
  },
  logs: { description: "View agent logs", usage: "uniflow logs <agent> [-n lines] [--follow]" },
  peek: { description: "Capture agent pane snapshot", usage: "uniflow peek <agent>" },
  nudge: { description: "Manually nudge an agent", usage: "uniflow nudge <agent>" },
  respawn: { description: "Respawn a crashed agent", usage: "uniflow respawn <agent>" },
  attach: { description: "Attach to tmux session", usage: "uniflow attach" },
  worktree: {
    description: "Manage git worktrees",
    usage: "uniflow worktree <create|merge> [options]",
  },
  tui: { description: "Open TUI monitor", usage: "uniflow tui" },
};

function printHelp(): void {
  console.log(`uniflow v${VERSION} — tmux-native multi-agent orchestration\n`);
  console.log("Usage: uniflow <command> [options]\n");
  console.log("Commands:");

  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(maxLen + 2)}${cmd.description}`);
  }

  console.log('\nRun "uniflow <command> --help" for command-specific help.');
}

function printVersion(): void {
  console.log(`uniflow v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (args[0] === "--version" || args[0] === "-v") {
    printVersion();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (!(command in COMMANDS)) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "uniflow --help" for available commands.');
    process.exit(1);
  }

  // Show command-specific help
  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    const cmd = COMMANDS[command];
    console.log(`${cmd.description}\n`);
    console.log(`Usage: ${cmd.usage}`);
    process.exit(0);
  }

  // Dynamic import for each command handler
  try {
    const handler = await loadCommand(command);
    await handler(commandArgs);
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error("An unexpected error occurred.");
    }
    process.exit(1);
  }
}

type CommandHandler = (args: string[]) => Promise<void>;

async function loadCommand(command: string): Promise<CommandHandler> {
  switch (command) {
    case "init":
      return (await import("./cli/init.js")).default;
    case "doctor":
      return (await import("./cli/doctor.js")).default;
    case "install":
      return (await import("./cli/install.js")).default;
    case "start":
      return (await import("./cli/start.js")).default;
    case "stop":
      return (await import("./cli/stop.js")).default;
    case "status":
      return (await import("./cli/status.js")).default;
    case "spawn":
      return (await import("./cli/spawn.js")).default;
    case "send":
      return (await import("./cli/send.js")).default;
    case "assign":
      return (await import("./cli/assign.js")).default;
    case "task-add":
      return (await import("./cli/task-add.js")).default;
    case "agents":
      return (await import("./cli/agents.js")).default;
    case "tasks":
      return (await import("./cli/tasks.js")).default;
    case "logs":
      return (await import("./cli/logs.js")).default;
    case "peek":
      return (await import("./cli/peek.js")).default;
    case "nudge":
      return (await import("./cli/nudge.js")).default;
    case "respawn":
      return (await import("./cli/respawn.js")).default;
    case "attach":
      return (await import("./cli/attach.js")).default;
    case "worktree":
      return (await import("./cli/worktree.js")).default;
    case "tui":
      return (await import("./cli/tui.js")).default;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main();
