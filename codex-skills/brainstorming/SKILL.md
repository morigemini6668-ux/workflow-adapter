---
name: brainstorming
description: Start a brainstorming workflow that gathers context and research, then synthesizes a structured `brainstorming.md`.
metadata:
  argument-hint: "<optional: subject description> [--yes] [--subagent] [--rounds N]"
  disable-model-invocation: true
---

# Codex Wrapper: brainstorming

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/brainstorming/SKILL.md`](../../skills/brainstorming/SKILL.md).

Follow the original workflow with these overrides:

- Prefer the original `--subagent` path by default, even if the user does not spell it out.
- Spawn historian, researcher, and reviewer with `spawn_agent`.
- Read the matching role prompts under [`../../agents/`](../../agents/) before spawning and adapt teammate-only instructions to Codex subagent behavior.
