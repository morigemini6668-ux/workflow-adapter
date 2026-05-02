---
name: archive
description: "Archive completed workflow subjects by extracting architectural decision records (ADRs) and cleaning up subject directories. Use this skill when the user mentions \"archive\", \"아카이브\", \"정리\", \"cleanup\", \"ADR\", \"결정 기록\", or wants to preserve decisions from past sessions while keeping .workflow-adapter/ lean."
---

# Archive (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/archive/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
