---
name: brainstorming
description: "Starts a brainstorming session for a given subject. Spawns historian, researcher, and reviewer teammates who work concurrently, then the orchestrator moderates a multi-round group discussion (default 2 rounds, configurable via --rounds N) where teammates debate and react to each other's findings. Produces a structured brainstorming.md output."
---

# Brainstorming (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/brainstorming/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
