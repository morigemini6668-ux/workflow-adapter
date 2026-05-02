---
name: spec
description: "Create a technical specification from brainstorming or investigation results. Use this skill when the user mentions \"spec\", \"specification\", \"technical design\", \"interface design\", \"detailed design\", \"architecture design\", \"data model design\", \"API design\", \"사양\", \"기술 설계\", \"인터페이스 설계\", \"상세 설계\", \"아키텍처 설계\", \"데이터 모델 설계\", \"API 설계\", \"스펙 작성\", \"spec 작성\", or when brainstorming produced decisions involving multiple components, API design, data models, or 3+ files — even if the user doesn't explicitly say \"spec\". Also use when the user asks \"how should we implement this?\", \"구현 어떻게 하지?\", \"기술적으로 어떻게?\", or wants to define interfaces before planning tasks."
---

# Spec (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/spec/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
