---
name: shutdown
description: Shut down Codex subagents that were started by the workflow-adapter spawn workflow.
metadata:
  argument-hint: "[agent-name | --all] [--team <name>]"
---

# Codex Wrapper: shutdown

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/shutdown/SKILL.md`](../../../claude/skills/shutdown/SKILL.md).

Follow the original workflow with these overrides:

- Use the persistent registry at `./.workflow-adapter/codex/teams/<team-name>.json`.
- Resolve agent ids from that registry and close them with `close_agent`.
- Update or remove the registry file after shutdown so later turns do not see stale members.
