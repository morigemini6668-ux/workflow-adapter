---
name: spawn
description: "Spawn standalone agent teammates for ad-hoc delegation. Use this skill when the user asks to \"spawn agents\", \"팀 띄워줘\", \"에이전트 띄워\", \"spawn a team\", \"researcher 띄워\", \"팀 스폰\", \"spawn historian\", \"에이전트 스폰\", \"teammate 띄워줘\", \"팀메이트 생성\", or wants to have agent teammates running that they can delegate tasks to outside of structured workflows (team-loop, execute, etc.). This is for standalone, ad-hoc agent management — not for workflow-internal spawning."
---

# Spawn (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/spawn/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
