---
name: qa
description: Run QA, reproduce issues, apply fixes, and verify the result using Codex-compatible browser and code-editing tools.
---

# Codex Wrapper: qa

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/qa/SKILL.md`](../../../claude/skills/qa/SKILL.md).

Follow the original workflow with these overrides:

- Prefer Codex web tools when available.
- Otherwise use the existing QA browse tooling through shell commands.
- Preserve the original loop shape of test, fix, and re-verify.
