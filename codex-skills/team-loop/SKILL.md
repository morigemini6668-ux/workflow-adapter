---
name: team-loop
description: Run the phased research-plan-execute-verify loop in Codex using subagents instead of Claude teammate infrastructure.
argument-hint: "<subject> [--max-iterations N] [--quick|--deep] [--worktree|--no-worktree]"
disable-model-invocation: true
---

# Codex Wrapper: team-loop

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/team-loop/SKILL.md`](../../skills/team-loop/SKILL.md).

Follow the original workflow with these overrides:

- Emulate the phased loop with Codex subagents instead of `TeamCreate` and `SendMessage`.
- Reuse the same state files, target files, and iteration artifacts that the original workflow defines.
- Prefer one-shot phase-specific subagents unless persistent agents materially improve the current loop iteration.
