---
name: autopilot-ralph
description: Run the autonomous analyze-execute-verify loop for a task until it is resolved or the iteration budget is exhausted.
metadata:
  argument-hint: "<subject> [--max-iterations N] [--copilot] [--worktree|--no-worktree]"
  disable-model-invocation: true
---

# Codex Wrapper: autopilot-ralph

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/autopilot-ralph/SKILL.md`](../../skills/autopilot-ralph/SKILL.md).

Follow the original workflow with these overrides:

- Keep the single-agent Ralph loop structure as written.
- If the original expects worktree helper tools, prefer staying in the current workspace unless the user explicitly asks for isolated worktree execution.
- If `--copilot` is requested, use the repo's existing Copilot scripts exactly as the original skill describes.
