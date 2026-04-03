---
name: plan
description: Create `plan.md` and `worker.md` from prior workflow artifacts, then validate them with a reviewer subagent.
metadata:
  argument-hint: "<optional: subject name> [--yes] [--subagent]"
  disable-model-invocation: true
---

# Codex Wrapper: plan

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/plan/SKILL.md`](../../../claude/skills/plan/SKILL.md).

Follow the original workflow with these overrides:

- Prefer the original `--subagent` path by default.
- Use a one-shot reviewer `spawn_agent` call in place of reviewer teammates or team messaging.
- Keep the output files and their structure identical to the original workflow.
