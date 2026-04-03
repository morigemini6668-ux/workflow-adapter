---
name: spawn
description: >-
  Spawn standalone agent teammates for ad-hoc delegation. Use this skill when
  the user asks to "spawn agents", "팀 띄워줘", "에이전트 띄워", "spawn a team",
  "researcher 띄워", "팀 스폰", "spawn historian", "에이전트 스폰", "teammate 띄워줘",
  "팀메이트 생성", or wants to have agent teammates running that they can delegate
  tasks to outside of structured workflows (team-loop, execute, etc.). This is
  for standalone, ad-hoc agent management — not for workflow-internal spawning.
argument-hint: "[agent-types...] [--team <name>]"
---

# Spawn — Standalone Agent Teammates

Spawn agent teammates for ad-hoc delegation outside structured workflows.
Unlike team-loop or execute (which manage agents internally), this skill lets
the user explicitly stand up agents, delegate work via SendMessage, and tear
them down with `/shutdown` when done.

## Step 0: Parse Arguments

Extract from the skill arguments:
- `agent-types` (optional) — space-separated list of agent roles to spawn
  - Available: `historian`, `researcher`, `planner`, `executer`, `reviewer`, `browser`, `enricher`
  - Default (no types specified): `historian`, `researcher`, `executer`
- `--team <name>` (optional) — team name; default: `wa-standalone`

Examples:
```
/spawn                              → historian, researcher, executer in wa-standalone
/spawn researcher executer          → researcher, executer in wa-standalone
/spawn --team my-project            → historian, researcher, executer in wa-my-project
/spawn researcher --team infra-fix  → researcher in wa-infra-fix
```

Normalize the team name: if the user provides a name without the `wa-` prefix, prepend `wa-` (e.g., `my-project` → `wa-my-project`). If already prefixed, use as-is.

## Step 1: Check Existing Team

Check if a team config already exists by reading `~/.claude/teams/{team_name}/config.json`.

**If file exists:**
Read the config to see current members.
Use AskUserQuestion:
```
"Team '{team_name}' already exists with members: {member list}.
Add the requested agents to the existing team, or replace the team?"
Options: [Add to existing, Replace (shutdown all + recreate), Cancel]
```
- **Add**: skip TeamCreate, spawn only agents not already in the team.
- **Replace**: send shutdown to all existing members, wait for confirmations, TeamDelete, then proceed to Step 2.
- **Cancel**: stop.

**If file does not exist:** proceed to Step 2.

## Step 2: Create Team

```
TeamCreate({ team_name: "{team_name}", description: "Standalone agent team" })
```

## Step 3: Spawn Agents

Build the teammate list string for the prompt (e.g., `"historian, researcher, executer"`).

For each requested agent type, spawn using the Agent tool with `subagent_type: "workflow-adapter:{agent-type}"`. The registered agent type automatically loads the agent's system prompt and configuration from `${CLAUDE_PLUGIN_ROOT}/agents/{agent-type}.md` — no need to read it manually.

Spawn all agents in a single turn (parallel Agent calls) for speed. Use this prompt template for each:

```
You are a standalone {agent-type} teammate spawned for ad-hoc work.

Team name: {team_name}
Your name: {agent-type}
Team leader: orchestrator
Other teammates: {comma-separated list of all other agents being spawned}

You are NOT part of a structured workflow (team-loop, execute, etc.).
Wait for a task assignment from the orchestrator before starting work.

## How to operate

1. Wait for a task via SendMessage from the orchestrator
2. Execute the task using your full tool set
3. Report results: SendMessage({ to: 'orchestrator', message: '...', summary: '...' })
4. Coordinate with teammates when useful:
   SendMessage({ to: '{teammate-name}', message: '...', summary: '...' })
5. Stay available for follow-up work after completing a task
6. Do NOT shut down unless you receive a shutdown message

## Principle Compliance

Check `.workflow-adapter/principle.md` — if it exists, follow it.
Check `.workflow-adapter/principle.{agent-type}.md` — if it exists, follow it (takes priority).
```

Spawn call pattern:
```
Agent({
  description: "{Agent-type}: standalone teammate",
  subagent_type: "workflow-adapter:{agent-type}",
  team_name: "{team_name}",
  name: "{agent-type}",
  run_in_background: true,
  prompt: "<prompt from template above>"
})
```

**Executer naming**: if multiple executers are requested, name them `executer-1`, `executer-2`, etc. A single executer is just `executer`.

## Step 4: Report

After all agents are spawned, report to the user:

```
Team '{team_name}' is ready with {N} agents:
- {agent-type-1} — {one-line role description}
- {agent-type-2} — {one-line role description}
...

Delegate work:
  SendMessage({ to: "researcher", message: "...", summary: "..." })

Shut down when done:
  /shutdown [--team {team_name}]
```

Role descriptions for the report:
- **historian** — project context, git history, past decisions
- **researcher** — web search, docs lookup, codebase exploration
- **planner** — execution plans from research findings
- **executer** — implementation, code changes, task execution
- **reviewer** — code review, plan validation, quality checks
- **browser** — web page interaction, screenshots, form filling
- **enricher** — telemetry instrumentation, logging, tracing
