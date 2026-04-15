---
name: browse
description: |
  Open pages, inspect them, and interact with the repo's browser tooling or available
  Codex web tools. Use when asked to "open this page", "browse to", "navigate to",
  "브라우저 열어", "사이트 열어줘", "스크린샷 찍어줘", or any request to view/interact
  with a web page. For TUI/tmux control, use tui-browse (Claude Code only).
---

# Codex Wrapper: browse

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/browse/ORIGINAL.md`](../../claude-compat/skills/browse/ORIGINAL.md).

Follow the original workflow with these overrides:

- Prefer Codex browser or web tools when available.
- Otherwise run the bundled [`../../claude-compat/scripts/qa-browse/`](../../claude-compat/scripts/qa-browse/) flow through local shell commands.
- When a screenshot file is created locally, use `view_image` so the user can inspect it.
- Never run `qa-browse` shell commands in parallel. Keep `goto`, `snapshot`, `status`, `handoff`, `resume`, and related `$B` commands strictly serial.
