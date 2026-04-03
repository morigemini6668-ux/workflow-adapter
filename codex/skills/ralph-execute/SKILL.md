---
name: ralph-execute
description: Run the Ralph execution loop over an existing plan using Codex subagents or Copilot when requested.
metadata:
  argument-hint: "<subject> [--max-iterations N] [--copilot]"
  disable-model-invocation: true
---

# Codex Wrapper: ralph-execute

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/ralph-execute/ORIGINAL.md`](../../claude-compat/skills/ralph-execute/ORIGINAL.md).

Follow the original workflow with these overrides:

- Translate one-shot Claude subagents directly to `spawn_agent`.
- Keep plan updates and verification in the orchestrator, as the original skill expects.
- If `--copilot` is requested, use the existing Copilot path.
