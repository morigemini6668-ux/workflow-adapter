---
name: ralph-execute
description: "Runs a Ralph Wiggum-style iterative execution loop. Reads plan.md, spawns one-shot executer subagents, verifies completion, and loops until all tasks complete or max iterations reached."
---

# Ralph Execute (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/ralph-execute/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
