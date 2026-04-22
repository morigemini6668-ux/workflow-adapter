---
name: qa-report
description: |
  Report-only QA testing using Codex-compatible browser tools. Produces structured
  findings without applying fixes. Browser-only in Codex — TUI/tmux QA is not available.
  Use when asked to "just report bugs", "qa report only", "QA 리포트만",
  "test but don't fix", or "버그 리포트만 줘".
  For the full test-fix-verify loop, use qa.
---

# Codex Wrapper: qa-report

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/qa-report/ORIGINAL.md`](../../claude-compat/skills/qa-report/ORIGINAL.md).

Follow the original workflow with these overrides:

- Prefer Codex web tools when available.
- Otherwise use the existing QA browse tooling through shell commands.
- Keep the original report-only constraint: never apply fixes in this skill.
- **TUI/tmux is not supported in Codex.** If the user requests TUI QA, explain that this Codex environment does not have tmux access and suggest using Claude Code with the `/workflow-adapter:qa-report` skill instead.
