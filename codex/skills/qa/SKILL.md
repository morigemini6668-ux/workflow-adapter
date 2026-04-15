---
name: qa
description: |
  Run QA, reproduce issues, apply fixes, and verify the result using Codex-compatible
  browser and code-editing tools. Browser-only in Codex — TUI/tmux QA is not available.
  Use when asked to "qa", "QA", "test this site", "find bugs", "test and fix",
  "테스트해줘", "버그 찾아줘", or "fix what's broken".
  For report-only mode, use qa-report.
---

# Codex Wrapper: qa

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/qa/ORIGINAL.md`](../../claude-compat/skills/qa/ORIGINAL.md).

Follow the original workflow with these overrides:

- Prefer Codex web tools when available.
- Otherwise use the existing QA browse tooling through shell commands.
- Preserve the original loop shape of test, fix, and re-verify.
- **TUI/tmux is not supported in Codex.** If the user requests TUI QA, explain that this Codex environment does not have tmux access and suggest using Claude Code with the `/workflow-adapter:qa` skill instead.
