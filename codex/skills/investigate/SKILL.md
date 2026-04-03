---
name: investigate
description: Investigate a problem with Codex subagents, produce `investigation.md`, and refine the diagnosis when evidence is incomplete.
metadata:
  argument-hint: "<optional: problem description> [--yes] [--subagent] [--rounds N]"
  disable-model-invocation: true
---

# Codex Wrapper: investigate

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../../claude/skills/investigate/SKILL.md`](../../../claude/skills/investigate/SKILL.md).

Follow the original workflow with these overrides:

- Prefer the original `--subagent` path by default.
- Spawn historian, researcher, reviewer, and enricher with `spawn_agent` as needed.
- If the original flow calls for telemetry enrichment, keep the same gate and use an `enricher` worker subagent for the instrumentation step.
