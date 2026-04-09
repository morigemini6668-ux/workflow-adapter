import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Stable source root — resolved from this module's location at import time.
 * import.meta.dir = <repo>/src/cli/, so ../../ = <repo>/
 * This is reliable regardless of how uniflow was invoked (bun link, direct, wrapper).
 */
const SOURCE_ROOT = resolve(import.meta.dir, "..", "..");

async function runBunLink(): Promise<boolean> {
  try {
    console.log("Global CLI (bun link):");
    const proc = Bun.spawn(["bun", "link"], {
      cwd: SOURCE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code === 0) {
      console.log("  \u2713 bun link succeeded \u2014 uniflow available globally");
      return true;
    }
    console.log(`  \u2717 bun link failed (exit ${code}): ${(stderr || stdout).trim()}`);
    console.log(`    Run manually: cd ${SOURCE_ROOT} && bun link`);
    return false;
  } catch (err) {
    console.log(
      `  \u2717 bun link failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    console.log(`    Run manually: cd ${SOURCE_ROOT} && bun link`);
    return false;
  }
}

async function writeCommandFiles(dir: string): Promise<void> {
  await writeFile(
    join(dir, "uniflow.md"),
    `---
description: Show uniflow help and available commands
allowed-tools: Bash
---

Run the following command and show the output to the user:

\`\`\`bash
uniflow --help
\`\`\`
`,
    "utf-8",
  );

  await writeFile(
    join(dir, "uniflow-spawn.md"),
    `---
description: Spawn a uniflow worker agent
argument-hint: "<name> [--cli claude|codex] [--role executor]"
allowed-tools: Bash
---

Run the following command to spawn a worker agent:

\`\`\`bash
uniflow spawn $ARGUMENTS
\`\`\`
`,
    "utf-8",
  );

  await writeFile(
    join(dir, "uniflow-status.md"),
    `---
description: Show uniflow session status
allowed-tools: Bash
---

Run the following command to show session status:

\`\`\`bash
uniflow status $ARGUMENTS
\`\`\`
`,
    "utf-8",
  );

  await writeFile(
    join(dir, "uniflow-shutdown.md"),
    `---
description: Stop the uniflow session and all agents
allowed-tools: Bash
---

Run the following command to stop the session:

\`\`\`bash
uniflow stop $ARGUMENTS
\`\`\`
`,
    "utf-8",
  );
}

async function writeOrchestratorSkill(dir: string): Promise<void> {
  await writeFile(
    join(dir, "SKILL.md"),
    `---
description: >
  This skill should be used when the user asks to "start a multi-agent workflow",
  "orchestrate agents", "spawn team", "uniflow start", or mentions "multi-agent orchestration".
allowed-tools: Bash
---

# uniflow Orchestrator

You are part of a uniflow multi-agent orchestration session.

## Quick Reference

- \`uniflow status\` \u2014 check session and agent status
- \`uniflow spawn <name>\` \u2014 spawn a new worker agent
- \`uniflow send <agent> <message>\` \u2014 send message to agent
- \`uniflow task-add <subject>\` \u2014 create a new task
- \`uniflow assign <task-id> <agent>\` \u2014 assign task to agent
- \`uniflow agents\` \u2014 list all agents
- \`uniflow tasks\` \u2014 list all tasks
- \`uniflow logs <agent>\` \u2014 view agent logs
- \`uniflow stop\` \u2014 stop the session

## Workflow

1. Check status: \`uniflow status\`
2. Spawn workers: \`uniflow spawn worker-1\`
3. Create tasks: \`uniflow task-add "implement feature X"\`
4. Assign work: \`uniflow assign <task-id> worker-1\`
5. Monitor: \`uniflow status --watch\`
`,
    "utf-8",
  );
}

async function writeHooksJson(dir: string): Promise<void> {
  await writeFile(
    join(dir, "hooks.json"),
    `${JSON.stringify(
      [
        {
          event: "SessionStart",
          hooks: [
            {
              type: "command",
              command: "uniflow init 2>/dev/null || true",
            },
          ],
        },
      ],
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

async function installClaudePlugin(): Promise<boolean> {
  const claudeDir = join(homedir(), ".claude");
  if (!existsSync(claudeDir)) {
    console.log("  \u2717 Claude Code config dir not found (~/.claude/)");
    return false;
  }

  const pluginDir = join(claudeDir, "plugins", "uniflow");
  const pluginJsonDir = join(pluginDir, ".claude-plugin");
  const binDir = join(pluginDir, "bin");
  const commandsDir = join(pluginDir, "commands");
  const skillDir = join(pluginDir, "skills", "uniflow-orchestrator");
  const hooksDir = join(pluginDir, "hooks");

  await mkdir(pluginJsonDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(commandsDir, { recursive: true });
  await mkdir(skillDir, { recursive: true });
  await mkdir(hooksDir, { recursive: true });

  // plugin.json — includes source field pointing to repo root for start.ts reference
  await writeFile(
    join(pluginJsonDir, "plugin.json"),
    `${JSON.stringify(
      {
        name: "uniflow",
        description: "tmux-native multi-agent orchestration",
        version: "0.1.0",
        source: SOURCE_ROOT,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  // bin/uniflow wrapper — uses stable SOURCE_ROOT (not dirname(process.argv[1]))
  const binPath = join(binDir, "uniflow");
  const entryPoint = join(SOURCE_ROOT, "src", "index.ts");
  await writeFile(binPath, `#!/usr/bin/env bash\nexec bun run "${entryPoint}" "$@"\n`, {
    mode: 0o755,
  });

  // Commands (4 files)
  await writeCommandFiles(commandsDir);

  // Skill (uniflow-orchestrator)
  await writeOrchestratorSkill(skillDir);

  // Hooks (SessionStart auto-init)
  await writeHooksJson(hooksDir);

  console.log(`  \u2713 Claude Code plugin installed: ${pluginDir}`);
  console.log("  \u2713 uniflow CLI available in Claude Code sessions");
  console.log("  \u2713 4 commands, 1 skill, hooks.json created");
  return true;
}

async function installCodexSkill(): Promise<boolean> {
  const codexSkillDir = join(homedir(), ".agents", "skills", "uniflow");
  const scriptsDir = join(codexSkillDir, "scripts");
  const referencesDir = join(codexSkillDir, "references");

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(referencesDir, { recursive: true });

  // Enhanced SKILL.md with trigger conditions, protocol summary, and script references
  await writeFile(
    join(codexSkillDir, "SKILL.md"),
    `---
name: uniflow
description: >
  tmux-native multi-agent orchestration via uniflow CLI.
  Use this skill when orchestrating multi-agent workflows, spawning worker agents,
  managing tasks across agents, or coordinating team-based development sessions.
---

# uniflow

uniflow orchestrates multi-agent workflows using tmux sessions. Each agent runs
in its own tmux pane with file-based IPC (inbox, outbox, task files).

## CLI Commands

| Command | Description |
|---------|-------------|
| \`uniflow status\` | Check session and agent status |
| \`uniflow spawn <name>\` | Spawn a new worker agent |
| \`uniflow send <agent> <msg>\` | Send message to agent inbox |
| \`uniflow task-add <subject>\` | Create a new task |
| \`uniflow assign <task-id> <agent>\` | Assign task to agent |
| \`uniflow agents\` | List all agents |
| \`uniflow tasks\` | List all tasks |
| \`uniflow logs <agent>\` | View agent logs |
| \`uniflow stop\` | Stop the session |

## Agent Protocol

Agents communicate via file-based IPC:

- **Inbox**: Each agent has an inbox file. The daemon writes messages here and
  sends a tmux trigger to notify the agent.
- **Outbox**: Agents append JSON lines to a shared outbox.jsonl to report
  task completion or failure.
- **Tasks**: JSON files in the tasks directory track task state (pending,
  in_progress, completed, failed).

See \`references/protocol.md\` for the full protocol specification.

## Shell Helper

Source \`scripts/uniflow.sh\` for convenient shell functions:

\`\`\`bash
source ~/.agents/skills/uniflow/scripts/uniflow.sh
uf-status          # quick status check
uf-spawn worker-1  # spawn a worker
uf-send worker-1 "do the thing"
\`\`\`
`,
    "utf-8",
  );

  // scripts/uniflow.sh — shell helper for Codex agents
  await writeFile(
    join(scriptsDir, "uniflow.sh"),
    `#!/usr/bin/env bash
# uniflow shell helpers for Codex agents
# Source this file: source ~/.agents/skills/uniflow/scripts/uniflow.sh

uf-status() {
  uniflow status "$@"
}

uf-spawn() {
  uniflow spawn "$@"
}

uf-send() {
  local agent="$1"; shift
  uniflow send "$agent" "$*"
}

uf-task-add() {
  uniflow task-add "$@"
}

uf-assign() {
  uniflow assign "$@"
}

uf-agents() {
  uniflow agents "$@"
}

uf-tasks() {
  uniflow tasks "$@"
}

uf-logs() {
  uniflow logs "$@"
}
`,
    { mode: 0o755 },
  );

  // references/protocol.md — agent protocol documentation
  await writeFile(
    join(referencesDir, "protocol.md"),
    `# uniflow Agent Protocol

## Overview

uniflow uses file-based IPC with tmux for agent orchestration. A central daemon
manages session state and dispatches messages to agents running in tmux panes.

## State Directory

\`\`\`
~/.uniflow/projects/<project>/sessions/<session-id>/
\u251c\u2500\u2500 session.json      # Session metadata (agents, status, tmux session name)
\u251c\u2500\u2500 agents/           # Per-agent state files (<name>.json)
\u251c\u2500\u2500 inboxes/          # Per-agent inbox files (<name>.md)
\u251c\u2500\u2500 tasks/            # Task files (<id>.json)
\u251c\u2500\u2500 outbox.jsonl      # Shared outbox (append-only, one JSON per line)
\u251c\u2500\u2500 events.jsonl      # Event log (append-only)
\u2514\u2500\u2500 logs/             # Agent log files
\`\`\`

## Agent State

Each agent has a JSON state file with:

- \`name\`: Agent identifier
- \`cli\`: "claude" or "codex"
- \`role\`: Agent role (e.g., "executor", "researcher")
- \`state\`: One of: starting, idle, working, blocked, done, failed
- \`current_task\`: Currently assigned task ID (or null)
- \`pane_id\`: tmux pane identifier

## Task Model

Tasks are JSON files with:

- \`id\`: Unique task identifier
- \`subject\`: Short description
- \`status\`: pending | in_progress | completed | failed
- \`assignee\`: Agent name (or null)
- \`priority\`: 1 (highest) to 5 (lowest)
- \`depends_on\`: Array of task IDs this task depends on

## Dispatch

The daemon dispatches messages to agents in two modes:

1. **interrupt**: Sends CLI interrupt key (C-c for Claude, Escape for Codex),
   waits, then pastes the trigger message. For urgent messages.
2. **nudge**: Only delivers if the agent appears idle. For gentle task delivery.

## Outbox Protocol

Agents report results by appending JSON lines to \`outbox.jsonl\`:

\`\`\`json
{
  "agent": "worker-1",
  "task": "task-001",
  "status": "completed",
  "summary": "Implemented feature X",
  "files_changed": ["src/foo.ts", "src/bar.ts"],
  "timestamp": "2026-01-01T00:00:00.000Z"
}
\`\`\`

The daemon polls the outbox and processes entries to update task states.
`,
    "utf-8",
  );

  // Append to AGENTS.md if exists
  const agentsPath = join(homedir(), ".codex", "AGENTS.md");
  if (existsSync(agentsPath)) {
    const content = await readFile(agentsPath, "utf-8");
    if (!content.includes("uniflow")) {
      await appendFile(
        agentsPath,
        '\n## uniflow Integration\n\n- Use `uniflow` CLI to orchestrate multi-agent workflows via tmux\n- State directory: ~/.uniflow/\n- To spawn agents: `uniflow spawn <count>:<role> "task description"`\n- Run `uniflow --help` for available commands\n',
        "utf-8",
      );
      console.log("  \u2713 AGENTS.md updated with uniflow section");
    }
  }

  console.log(`  \u2713 Codex skill installed: ${codexSkillDir}`);
  console.log("  \u2713 scripts/uniflow.sh, references/protocol.md created");
  return true;
}

export default async function install(_args: string[]): Promise<void> {
  console.log("Installing uniflow integrations...\n");

  // 1. Claude Code plugin
  console.log("Claude Code:");
  const claudeOk = await installClaudePlugin();
  if (!claudeOk) {
    console.log("  (skipped \u2014 Claude Code not detected)\n");
  } else {
    console.log();
  }

  // 2. Codex CLI skill
  console.log("Codex CLI:");
  const codexOk = await installCodexSkill();
  if (!codexOk) {
    console.log("  (skipped)\n");
  } else {
    console.log();
  }

  // 3. bun link for global CLI availability
  await runBunLink();
  console.log();

  // 4. Post-install verification via doctor
  console.log("Verifying installation...\n");
  const doctor = (await import("./doctor.js")).default;
  await doctor([]);
}
