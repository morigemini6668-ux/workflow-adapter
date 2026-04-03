---
name: shutdown
description: >-
  Shut down standalone agent teammates spawned with /spawn. Use this skill when
  the user asks to "shutdown agents", "팀 종료", "에이전트 종료", "shutdown team",
  "팀 내려", "에이전트 내려", "shutdown all", "스폰 종료", "teammate 종료", "팀메이트
  종료", "팀 정리", or wants to stop running agent teammates. Works with both
  individual agent shutdown and full team teardown. Pairs with /spawn.
argument-hint: "[agent-name | --all] [--team <name>]"
---

# Shutdown — Stop Agent Teammates

Shut down agent teammates spawned via `/spawn`. Supports shutting down
individual agents or tearing down the entire team.

## Step 0: Parse Arguments

Extract from the skill arguments:
- `agent-name` (optional) — name of a specific agent to shut down (e.g., `researcher`, `executer`)
- `--all` (optional) — shut down all agents and delete the team
- `--team <name>` (optional) — team name; default: `wa-standalone`

If neither `agent-name` nor `--all` is provided, treat as `--all`.

Examples:
```
/shutdown                          → shutdown all in wa-standalone
/shutdown researcher               → shutdown researcher only in wa-standalone
/shutdown --all                    → shutdown all + TeamDelete in wa-standalone
/shutdown --all --team my-project  → shutdown all + TeamDelete in wa-my-project
/shutdown executer --team infra    → shutdown executer in wa-infra
```

Normalize the team name same as spawn: prepend `wa-` if missing.

## Step 1: Read Team Config

Read `~/.claude/teams/{team_name}/config.json` using the Read tool.

If the file doesn't exist, inform the user:
```
No active team '{team_name}' found. Nothing to shut down.
```
And stop.

Parse the `members` array to get the list of active teammates.

## Step 2: Shut Down Agents

### Individual shutdown (`agent-name` specified)

Check that the named agent exists in the team members list. If not, inform the user and list available members.

Send shutdown to the specific agent:
```
SendMessage({
  to: "{agent-name}",
  message: { type: "shutdown_request", reason: "User requested shutdown" },
  summary: "Shutdown {agent-name}"
})
```

Wait for the agent's shutdown confirmation (shutdown_response with `approve: true`).

After shutdown, re-read the team config to check remaining members. If no members remain, clean up:
```
TeamDelete()
```

Report:
```
Shut down {agent-name}.
{if members remain: Remaining agents in '{team_name}': {remaining list}}
{if no members remain: Team '{team_name}' deleted (no remaining agents).}
```

### Full team shutdown (`--all` or no agent specified)

Send shutdown to all team members in parallel:
```
SendMessage({ to: "{member-1}", message: { type: "shutdown_request", reason: "Team shutdown" }, summary: "Shutdown" })
SendMessage({ to: "{member-2}", message: { type: "shutdown_request", reason: "Team shutdown" }, summary: "Shutdown" })
...
```

Wait for all shutdown confirmations. Once all agents have confirmed (or become unresponsive — give a few seconds), delete the team:
```
TeamDelete()
```

Report:
```
Team '{team_name}' shut down. {N} agents terminated: {agent list}.
```
