---
name: copilot
description: "Converts workflow-adapter plugin components into GitHub Copilot project configuration files. Generates .github/copilot-instructions.md from principles, .github/agents/*.agent.md from agent definitions, and .github/instructions/*.instructions.md from skills. Transforms TeamCreate/SendMessage patterns into Task tool subagent patterns."
---

# Copilot (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/copilot/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
