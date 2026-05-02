---
name: broadcast
description: "Send or check broadcast messages between Claude sessions. Use this skill when you need to notify the user across sessions — e.g., a background/scheduled agent completed a task (coffee order, deploy, build), a teammate agent finished work, or any event the user should know about. Also use when the user asks to \"send a message\", \"broadcast\", \"알림 보내\", \"메시지 보내\", \"notify me\", or when you finish a long-running background task and want the user's active session to pick it up."
---

# Broadcast (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/broadcast/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
