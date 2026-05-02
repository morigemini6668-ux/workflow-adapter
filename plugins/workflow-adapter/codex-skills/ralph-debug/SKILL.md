---
name: ralph-debug
description: "This skill should be used when the user asks to \"ralph debug\", \"debug this in a loop\", \"auto-fix this bug\", \"iterative debugging loop\", \"ralph-debug\", \"반복 디버깅\", \"자동 디버깅 루프\", \"루프로 버그 고쳐줘\", \"버그 자동 수정\", or wants to run an automated root cause analysis → fix → verify loop that keeps iterating until a bug is resolved or max iterations is reached."
---

# Ralph Debug (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/ralph-debug/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
