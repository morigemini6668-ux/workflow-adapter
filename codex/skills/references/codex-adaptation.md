# Codex Adaptation Guide

These wrapper skills keep the existing Claude Code plugin intact and add a Codex-only compatibility layer.

## Base rule

For every wrapper skill:

1. Read this file first.
2. Read the original skill under `../../../claude/skills/<name>/SKILL.md`.
3. Preserve the original workflow intent, artifacts, and file layout.
4. Only translate Claude-specific tooling and teammate mechanics into Codex equivalents.

## Claude to Codex translation

| Claude workflow concept | Codex equivalent |
| --- | --- |
| `AskUserQuestion` | Ask the user directly in a concise plain-text message. Ask one blocking question at a time. |
| `Task(...)` / `Agent(...)` | `spawn_agent` |
| teammate messaging | `send_input` |
| waiting for background teammates | `wait_agent` |
| teammate shutdown | `close_agent` |
| `TeamCreate` / `TeamDelete` | Skip the team bus. Track spawned agent ids locally when persistence is needed. |
| `${CLAUDE_PLUGIN_ROOT}` | Resolve to the sibling `claude/` plugin root. |
| `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep` | Use Codex local tools. Prefer `exec_command`, `rg`, and `apply_patch`. |
| `EnterWorktree` / `ExitWorktree` | Prefer the current workspace. Only use `git worktree` when the user explicitly wants isolation or the workflow would be unsafe without it. |

## Subagent policy

- When an original skill already has a `--subagent` mode, prefer that path by default.
- When an original skill expects long-lived teammates, emulate that with `spawn_agent` plus `send_input` only if the user truly needs persistent collaboration.
- If a one-shot subagent is enough, prefer a fresh `spawn_agent` call over building long-lived coordination state.

## Recommended role mapping

- `historian`, `researcher`, `reviewer`: prefer `agent_type: "explorer"` when the work is mostly analysis.
- `executer`, `enricher`: prefer `agent_type: "worker"` when the agent is expected to change files.
- `planner`, `browser`: use `agent_type: "default"` unless a narrower role is clearly better.

## Agent prompt adaptation

When the original skill says to spawn a role-specific teammate:

1. Read the relevant file under `../../../claude/agents/`.
2. Keep the role responsibilities and constraints.
3. Remove teammate-only instructions that depend on `SendMessage`, team names, or Claude-specific hooks if they are not needed.
4. Replace "report via SendMessage" with either:
   - a direct return value for one-shot agents, or
   - `send_input` / shared-file updates for persistent agents.

## Persistent team registry

For wrapper skills that need agents to survive across turns, store a registry file at:

`./.workflow-adapter/codex/teams/<team-name>.json`

Suggested shape:

```json
{
  "team_name": "wa-example",
  "created_at": "2026-04-03T12:00:00Z",
  "members": [
    {
      "name": "researcher",
      "role": "researcher",
      "agent_id": "agent_123"
    }
  ]
}
```

Use that registry for `spawn`, `shutdown`, and any workflow that needs to resume or close persistent subagents.

## Broadcast fallback

Codex does not have Claude's hook-driven inter-session delivery. If a wrapper needs broadcast behavior, fall back to files under:

`./.workflow-adapter/codex/broadcast/`

Treat it as a manual queue, not a real-time event bus.

## Browser and QA fallback

- Prefer built-in Codex browser or web tools when available.
- Otherwise use the sibling Claude plugin's `scripts/qa-browse` CLI through `exec_command`.
- When a local screenshot path is produced, use `view_image` so the user can inspect it.

## File safety

- Do not modify the original Claude plugin assets unless the user explicitly asks.
- Put Codex-specific behavior in new files under `./skills/`, `./.codex-plugin/`, or new Codex-only state paths under `./.workflow-adapter/codex/`.
- Preserve existing file names and workflow artifacts such as `brainstorming.md`, `investigation.md`, `plan.md`, `worker.md`, and `ralph-state.md`.
