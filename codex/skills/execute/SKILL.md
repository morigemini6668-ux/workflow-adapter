---
name: execute
description: Execute a prepared `plan.md` by assigning work to Codex subagents and verifying completion.
metadata:
  argument-hint: "<optional: subject name> [--subagent] [--copilot]"
  disable-model-invocation: true
---

# Codex Wrapper: execute

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/execute/ORIGINAL.md`](../../claude-compat/skills/execute/ORIGINAL.md).

Follow the original workflow with these overrides:

- Prefer the original `--subagent` mode by default.
- Translate every `Task(...)` call into `spawn_agent`, and use `wait_agent` for batch completion.
- Use reviewer subagents as one-shot checks after each execution batch instead of teammate messaging.
