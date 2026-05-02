---
name: qa-report
description: "Report-only QA testing. Systematically tests a web application OR interactive CLI/TUI application and produces a structured report with health score, screenshots, and repro steps — but never fixes anything. Use when asked to \"just report bugs\", \"qa report only\", \"QA 리포트만\", \"test but don't fix\", \"버그 리포트만 줘\", \"TUI QA 리포트\", \"CLI 앱 테스트해줘\", \"tmux 앱 테스트\", or \"터미널 앱 QA\". Supports both browser (web) and TUI (tmux) targets — auto-detects based on input. For the full test-fix-verify loop, use /workflow-adapter:qa instead."
---

# Qa Report (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/qa-report/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
