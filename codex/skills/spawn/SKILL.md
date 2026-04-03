---
name: spawn
description: Spawn standalone workflow subagents for ad-hoc delegation and keep a local registry so they can be reused or shut down later.
metadata:
  argument-hint: "[agent-types...] [--team <name>]"
---

# Codex Wrapper: spawn

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/spawn/ORIGINAL.md`](../../claude-compat/skills/spawn/ORIGINAL.md).

Follow the original workflow with these overrides:

- Replace teammate creation with `spawn_agent`.
- Before spawning a role, read the matching prompt under [`../../claude-compat/agents/`](../../claude-compat/agents/) and adapt it into the subagent's initial prompt.
- Record spawned agent ids in `./.workflow-adapter/codex/teams/<team-name>.json` so later turns can reuse or close them.
