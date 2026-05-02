---
name: session-insights
description: "Analyze Claude Code session data to find improvement opportunities for workflow-adapter. Use this skill when the user mentions \"세션 분석\", \"session insights\", \"세션 인사이트\", \"사용 패턴\", \"usage patterns\", \"friction analysis\", \"개선점 분석\", \"plugin diagnostics\", \"session analysis\", \"사용 분석\", \"tool usage\", \"세션 데이터 분석\", \"플러그인 진단\", or asks about improving the plugin based on usage data. Also use when the user asks \"how can I improve this plugin?\", \"이 플러그인 어떻게 개선하지?\", \"뭐가 문제야?\", \"what's not working well?\", \"어떤 스킬이 안 쓰여?\", or wants a diagnostic overview. Use --plugin-only flag to filter results to workflow-adapter-specific data only."
---

# Session Insights (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/session-insights/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
