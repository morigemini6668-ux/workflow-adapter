---
name: ask-codex
description: "This skill should be used when the user asks to \\\"ask codex\\\", \\\"ask OpenAI Codex\\\", \\\"send to codex\\\", \\\"get codex's opinion\\\", \\\"codex help\\\", \\\"codex chat\\\", \\\"codex한테 물어봐\\\", \\\"codex에게 질문\\\", \\\"codex에게 질문해\\\", \\\"codex 의견\\\", \\\"codex 의견 들어봐\\\", \\\"코덱스한테 물어봐\\\", \\\"코덱스에게 질문\\\", or wants to send a message to the OpenAI Codex CLI running locally."
---

# Ask Codex (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/ask-codex/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
