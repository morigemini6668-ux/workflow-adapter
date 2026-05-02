---
name: supervisor
description: "Dispatches user requests to an autonomous Claude Code process in a tmux pane. Analyzes the request, discovers available skills/agents, selects the optimal approach, generates an enriched prompt, and launches it. The supervisor's job ends after dispatch — no monitoring or phase control. Use when the user says \"supervisor\", \"감독자\", \"대신 실행해줘\", \"다른 pane에서 돌려\", \"tmux로 실행\", \"자동으로 처리해줘\", \"dispatch\", or wants to delegate a task to a separate autonomous Claude instance."
---

# Supervisor (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/supervisor/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
