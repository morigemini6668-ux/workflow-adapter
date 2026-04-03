---
name: ask-copilot
description: Send a prompt to the local GitHub Copilot CLI bridge and return the response.
version: 0.5.0
---

# Codex Wrapper: ask-copilot

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../skills/ask-copilot/SKILL.md`](../../skills/ask-copilot/SKILL.md).

Follow the original workflow with these overrides:

- Resolve `${CLAUDE_PLUGIN_ROOT}` as this repository root.
- Run the existing scripts through Codex shell execution.
- If the Copilot CLI is missing, report that clearly instead of trying to emulate it.
