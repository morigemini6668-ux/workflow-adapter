---
name: broadcast
description: Send or inspect workflow notifications through a Codex-compatible filesystem queue.
---

# Codex Wrapper: broadcast

Read [`../references/codex-adaptation.md`](../references/codex-adaptation.md), then read [`../../claude-compat/skills/broadcast/ORIGINAL.md`](../../claude-compat/skills/broadcast/ORIGINAL.md).

Follow the original workflow with these overrides:

- Do not rely on Claude hooks or `~/.claude/...` delivery.
- Use `./.workflow-adapter/codex/broadcast/` as the queue location.
- Treat broadcasts as persisted notifications that the user or a later skill can inspect manually.
