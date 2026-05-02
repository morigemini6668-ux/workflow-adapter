---
name: investigate
description: "Investigates a problem by spawning historian, researcher, reviewer, and on-demand enricher teammates to analyze root causes and propose risk-assessed solutions. Teammates engage in structured evidence-based discussion rounds (default 1, configurable via --rounds N) where hypotheses are challenged, defended, and refined. Produces a structured investigation.md with hypotheses, evidence chains, and recommended actions. Use this skill when the user mentions \"investigate\", \"조사\", \"원인 파악\", \"이슈 분석\", \"문제 추적\", \"root cause\", \"debug this\", \"왜 이런 거야\", \"분석해줘\", \"장애 분석\", \"원인 분석\", \"문제 분석\", \"why is this happening\", \"diagnose\", \"troubleshoot\"."
---

# Investigate (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/investigate/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
