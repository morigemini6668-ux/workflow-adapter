---
name: backlog
description: "Manage deferred work items (tasks, principle changes, environment changes) that persist across workflow sessions. Supports CRUD operations — add, list, consume, defer, remove. Use this skill when the user mentions \"backlog\", \"백로그\", \"deferred items\", \"보류 항목\", or wants to track work identified but not addressed in the current session, even if they don't use the word \"backlog\" explicitly."
---

# Backlog (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/backlog/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
