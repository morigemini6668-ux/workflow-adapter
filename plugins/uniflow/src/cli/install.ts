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

async function writeManagePluginSkill(dir: string): Promise<void> {
  await writeFile(
    join(dir, "SKILL.md"),
    `---
name: manage-plugin
description: >
  Create, list, install, and remove uniflow native plugins.
  Use when the user asks to "create a uniflow plugin", "플러그인 만들어줘",
  "하네스 만들어줘", "uniflow plugin list", "플러그인 목록",
  "플러그인 삭제", "플러그인 설치", "make a harness", "build a plugin".
  Requires a running uniflow session for create.
allowed-tools: [Bash, Read, Write, Glob, Grep, AskUserQuestion]
argument-hint: "create|list|install|remove [name]"
---

# Uniflow Plugin Manager

Determine the operation from the user's request (default: create).

## Operation: List

\`\`\`bash
uniflow plugin list
\`\`\`

## Operation: Install

\`\`\`bash
uniflow plugin install $2
\`\`\`

## Operation: Remove

\`\`\`bash
uniflow plugin remove $2
\`\`\`

## Operation: Create (default)

Interactive plugin creation workflow. Guide the user through designing and
building a uniflow native plugin.

### Step 1: Understand the Domain

Ask the user about their plugin using AskUserQuestion:

1. "어떤 작업을 자동화하고 싶으신가요?" (domain — e.g., QA testing, code review)
2. "이 워크플로우에 어떤 agent 역할이 필요한가요?" (suggest examples: reviewer, tester, researcher)
3. "agent들이 어떤 순서로 작업하나요?" (workflow pattern: parallel, sequential, pipeline)
4. "plugin 이름은?" (auto-suggest based on domain, confirm with user)

### Step 2: Design Agents

For each agent role identified in Step 1, define:
- **Name**: lowercase, hyphenated (e.g., \`code-reviewer\`)
- **Purpose**: one-line description
- **Core loop**: main workflow pattern (e.g., Explore → Analyze → Report)
- **Key constraints**: scope limits, output format

### Step 3: Design Workflow

Write the SKILL.md workflow that the orchestrator will follow:
- Which agents to spawn (with \`uniflow spawn --role-file\`)
- Task assignment order
- Communication pattern (send messages, poll status)
- Convergence/completion criteria
- Cleanup (kill agents)

Use the brainstorming-harness as a reference pattern:
\`\`\`bash
cat \${CLAUDE_PLUGIN_ROOT}/../examples/brainstorming-harness/skills/brainstorming/SKILL.md
\`\`\`

### Step 4: Scaffold Plugin

Generate the plugin directory:

\`\`\`bash
uniflow plugin create {name}
\`\`\`

Then write the actual content:
1. Update \`.claude-plugin/plugin.json\` with proper description
2. Replace \`skills/default/SKILL.md\` with the designed workflow
3. Write \`skills/{skill-name}/references/*.md\` for each agent role instruction
4. Remove the sample agent file

### Step 5: Verify Structure

Verify the generated plugin:
\`\`\`bash
cat {name}/.claude-plugin/plugin.json
ls {name}/skills/*/SKILL.md
ls {name}/skills/*/references/*.md
\`\`\`

### Step 6: Install

Install the plugin for immediate use:
\`\`\`bash
uniflow plugin install ./{name}
\`\`\`

Confirm installation:
\`\`\`bash
uniflow plugin list
\`\`\`

Inform the user: "Plugin \\"{name}\\" created and installed. Start a new uniflow session
to use it, or add \`--plugin ./{name}\` to your current session."
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
  const managePluginSkillDir = join(pluginDir, "skills", "manage-plugin");
  const hooksDir = join(pluginDir, "hooks");

  await mkdir(pluginJsonDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(commandsDir, { recursive: true });
  await mkdir(skillDir, { recursive: true });
  await mkdir(managePluginSkillDir, { recursive: true });
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

  // Skill (manage-plugin — builder for creating new uniflow plugins)
  await writeManagePluginSkill(managePluginSkillDir);

  // Hooks (SessionStart auto-init)
  await writeHooksJson(hooksDir);

  console.log(`  \u2713 Claude Code plugin installed: ${pluginDir}`);
  console.log("  \u2713 uniflow CLI available in Claude Code sessions");
  console.log("  \u2713 4 commands, 2 skills (orchestrator, manage-plugin), hooks.json created");
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
