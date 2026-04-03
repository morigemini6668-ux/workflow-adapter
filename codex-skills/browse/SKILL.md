---
name: browse
description: Open pages, inspect them, and interact with the repo's browser tooling or available Codex web tools.
---

# Codex Wrapper: browse

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/browse/SKILL.md`](../../skills/browse/SKILL.md).

Follow the original workflow with these overrides:

- Prefer Codex browser or web tools when available.
- Otherwise run the existing `scripts/qa-browse` flow through local shell commands.
- When a screenshot file is created locally, use `view_image` so the user can inspect it.
- Never run `qa-browse` shell commands in parallel. Keep `goto`, `snapshot`, `status`, `handoff`, `resume`, and related `$B` commands strictly serial.
