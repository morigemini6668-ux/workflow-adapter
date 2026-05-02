---
name: ask-copilot
description: "This skill should be used when the user asks to \\\"ask copilot\\\", \\\"ask GitHub Copilot\\\", \\\"send to copilot\\\", \\\"get copilot's opinion\\\", \\\"copilot help\\\", \\\"copilot chat\\\", \\\"copilot한테 물어봐\\\", \\\"copilot에게 질문\\\", \\\"copilot에게 질문해\\\", \\\"copilot 의견\\\", \\\"copilot 의견 들어봐\\\", \\\"코파일럿한테 물어봐\\\", \\\"코파일럿에게 질문\\\", or wants to send a message to the GitHub Copilot agent running locally via JSON-RPC."
---

# Ask Copilot (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/ask-copilot/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
