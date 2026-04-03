---
name: team-loop-cancel
description: Cancel an active phased loop, clean up tracked Codex subagents, and summarize the current session state.
argument-hint: "<subject>"
disable-model-invocation: true
---

# Codex Wrapper: team-loop-cancel

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/team-loop-cancel/SKILL.md`](../../skills/team-loop-cancel/SKILL.md).

Follow the original workflow with these overrides:

- If the session has a Codex team registry, close tracked subagents before removing state.
- Replace every `AskUserQuestion` step with a direct question to the user.
- Keep the original state-file cleanup behavior otherwise unchanged.
