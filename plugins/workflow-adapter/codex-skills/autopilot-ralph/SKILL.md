---
name: autopilot-ralph
description: "This skill should be used when the user asks to \"autopilot ralph\", \"autopilot-ralph\", \"자동 루프\", \"문제 해결 루프\", \"autopilot loop\", \"알아서 고쳐줘\", \"루프 돌면서 해결해줘\", \"자동으로 해결\", \"keep fixing until done\", or wants an autonomous problem-solving loop that first clarifies the problem and verification method via interactive Q&A, then iterates Analyze-Execute-Verify until resolved."
---

# Autopilot Ralph (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/autopilot-ralph/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
