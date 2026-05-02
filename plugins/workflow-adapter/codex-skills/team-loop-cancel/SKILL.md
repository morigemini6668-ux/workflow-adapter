---
name: team-loop-cancel
description: "Cancels an active team-loop execution session by cleaning up the team, worktree, and state file. Prints a summary before deletion."
---

# Team Loop Cancel (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/team-loop-cancel/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
