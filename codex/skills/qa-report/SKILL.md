---
name: qa-report
description: Run report-only QA testing and produce structured findings without applying fixes.
---

# Codex Wrapper: qa-report

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/qa-report/SKILL.md`](../../../claude/skills/qa-report/SKILL.md).

Follow the original workflow with these overrides:

- Prefer Codex web tools when available.
- Otherwise use the existing QA browse tooling through shell commands.
- Keep the original report-only constraint: never apply fixes in this skill.
