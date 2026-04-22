---
name: ask-copilot
description: Send a prompt to the local GitHub Copilot CLI bridge and return the response.
metadata:
  version: "0.5.0"
---

# Codex Wrapper: ask-copilot

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/ask-copilot/ORIGINAL.md`](../../claude-compat/skills/ask-copilot/ORIGINAL.md).

Follow the original workflow with these overrides:

- Resolve `${CLAUDE_PLUGIN_ROOT}` as the bundled Claude-compat root under `../../claude-compat/`.
- Run the existing scripts through Codex shell execution.
- If the Copilot CLI is missing, report that clearly instead of trying to emulate it.
