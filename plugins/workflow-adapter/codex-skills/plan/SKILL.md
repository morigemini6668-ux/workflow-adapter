---
name: plan
description: "Creates a detailed execution plan (plan.md and worker.md) from brainstorming or investigation results. Spawns a reviewer teammate to validate task definitions, completion criteria, and worker allocation. Requires a subject folder with brainstorming.md or investigation.md."
---

# Plan (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/plan/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
