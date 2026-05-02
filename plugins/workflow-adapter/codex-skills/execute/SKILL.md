---
name: execute
description: "Executes a previously created plan by spawning executer and reviewer teammates. Reads plan.md and worker.md, assigns tasks to parallel executers, monitors progress, handles failures and context exhaustion, and verifies completion. Requires plan.md to exist (run the plan skill first)."
---

# Execute (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/execute/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
