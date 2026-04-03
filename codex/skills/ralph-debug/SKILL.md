---
name: ralph-debug
description: Run the Ralph debug loop to diagnose, fix, and verify a bug until it is resolved or the iteration budget is exhausted.
metadata:
  argument-hint: "<subject> [--max-iterations N] [--copilot]"
  disable-model-invocation: true
---

# Codex Wrapper: ralph-debug

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/ralph-debug/SKILL.md`](../../../claude/skills/ralph-debug/SKILL.md).

Follow the original workflow with these overrides:

- Keep the loop state and artifact files exactly as the original skill defines.
- Use Codex subagents only when the original workflow calls for one-shot delegated work.
- If `--copilot` is requested, use the repo's Copilot integration rather than emulating it.
