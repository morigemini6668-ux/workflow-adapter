---
name: generate-claude-md
description: "This skill should be used when the user wants to generate, create, optimize, audit, or reduce a CLAUDE.md or AGENTS.md file for an AI coding agent. Trigger phrases include \"generate CLAUDE.md\", \"create CLAUDE.md\", \"optimize CLAUDE.md\", \"clean up CLAUDE.md\", \"review my CLAUDE.md\", \"slim down CLAUDE.md\", \"CLAUDE.md 만들어줘\", \"CLAUDE.md 생성\", \"CLAUDE.md 최적화해줘\", \"CLAUDE.md 줄여줘\", \"CLAUDE.md가 너무 길어\", \"AGENTS.md 만들어줘\", \"프로젝트 컨텍스트 파일 생성\". Applies research (arXiv:2602.11988) showing comprehensive context files reduce agent performance."
---

# Generate Claude Md (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/generate-claude-md/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
