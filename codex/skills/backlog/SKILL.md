---
name: backlog
description: Manage deferred workflow items stored under `.workflow-adapter/backlog/`.
metadata:
  argument-hint: "<operation: add|list|consume|defer|remove> [item details]"
---

# Codex Wrapper: backlog

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/backlog/ORIGINAL.md`](../../claude-compat/skills/backlog/ORIGINAL.md).

Follow the original workflow with the shared Codex translation rules. Replace every `AskUserQuestion` step with a direct question to the user.
