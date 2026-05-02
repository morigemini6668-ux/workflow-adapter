---
name: tdd
description: "Test-Driven Development 워크플로우. 기능 구현 요청을 TDD 사이클 (테스트 목록 → 리뷰 → per-test RED→GREEN 루프 → Refactor)로 수행한다. Use this skill when the user says \"TDD\", \"TDD로 해\", \"테스트 먼저 작성\", \"test first\", \"red-green\", \"테스트 주도 개발\", \"test driven\", \"테스트부터\", \"write tests first\", \"TDD 방식으로\", \"TDD로 구현\", or mentions TDD methodology in the context of implementing a feature. Also trigger when the user explicitly asks to follow test-driven development for any implementation task, even if they just say \"TDD\" with no other context. Do NOT trigger for general testing requests without TDD intent — use qa or qa-report for those."
---

# Tdd (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/tdd/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
