---
name: qa
description: "Systematically QA test a web application OR interactive CLI/TUI application and fix bugs found. Runs QA testing, then iteratively fixes bugs in source code, committing each fix atomically and re-verifying. Use when asked to \"qa\", \"QA\", \"test this site\", \"find bugs\", \"test and fix\", \"테스트해줘\", \"버그 찾아줘\", \"fix what's broken\", \"TUI QA\", \"CLI 앱 테스트하고 고쳐\", \"tmux 앱 QA\", or \"터미널 앱 테스트해줘\". Supports both browser (web) and TUI (tmux) targets — auto-detects based on input. Three tiers: Quick (critical/high only), Standard (+ medium), Exhaustive (+ cosmetic). Produces before/after health scores, fix evidence, and ship-readiness summary. For report-only mode, use /workflow-adapter:qa-report."
---

# Qa (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/qa/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
