---
name: shutdown
description: "Shut down standalone agent teammates spawned with /spawn. Use this skill when the user asks to \"shutdown agents\", \"팀 종료\", \"에이전트 종료\", \"shutdown team\", \"팀 내려\", \"에이전트 내려\", \"shutdown all\", \"스폰 종료\", \"teammate 종료\", \"팀메이트 종료\", \"팀 정리\", or wants to stop running agent teammates. Works with both individual agent shutdown and full team teardown. Pairs with /spawn."
---

# Shutdown (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/shutdown/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
