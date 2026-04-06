---
name: broadcast
description: >-
  Send or check broadcast messages between Claude sessions. Use this skill when
  you need to notify the user across sessions — e.g., a background/scheduled agent
  completed a task (coffee order, deploy, build), a teammate agent finished work,
  or any event the user should know about. Also use when the user asks to "send a
  message", "broadcast", "알림 보내", "메시지 보내", "notify me", or when you finish
  a long-running background task and want the user's active session to pick it up.
---

# Broadcast — Inter-Session Message System

A filesystem-based message bus that lets any Claude instance notify the user's
currently active Claude Code session. Messages are written as JSON files; a
PreToolUse hook on the receiving side detects and delivers them automatically.

## When to send a broadcast

Send a broadcast whenever you complete work that the user should know about but
might not be watching this session for. Common scenarios:

- Scheduled/background task completed (e.g., coffee ordered, deploy finished)
- Teammate agent finished its assigned work
- An alert or reminder the user asked for earlier
- A long-running operation that needs user attention

## How to send a message

Write a JSON file to `~/.claude/workflow-adapter/broadcast/pending/`:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/broadcast-send.ts" \
  --from "your-identifier" \
  --subject "간단한 제목" \
  --body "상세 내용" \
  --priority normal
```

Or write the file directly:

```json
// ~/.claude/workflow-adapter/broadcast/pending/{timestamp}-{slug}.json
{
  "from": "coffee-scheduler",
  "subject": "☕ 커피 주문 완료",
  "body": "아이스 아메리카노 1잔 주문했습니다. 주문번호 #1234. 약 5분 후 픽업 가능.",
  "priority": "normal",
  "created_at": "2026-03-31T16:00:00+09:00"
}
```

### Message fields

| Field | Required | Description |
|-------|----------|-------------|
| `from` | Yes | Sender identifier (agent name, skill name, etc.) |
| `subject` | Yes | Short title — what happened |
| `body` | Yes | Details the user needs |
| `priority` | No | `"normal"` (default) or `"urgent"` |
| `created_at` | Yes | ISO 8601 timestamp |

### Priority guide

- **normal**: 일반 알림. 클로드가 현재 작업 흐름에 자연스럽게 끼워서 알려줌
- **urgent**: 즉시 주의 필요. 클로드가 하던 일을 잠시 멈추고 먼저 알려줌

### Filename convention

`{unix-timestamp-ms}-{slug}.json` — the slug is a URL-safe summary of the subject.

## How receiving works (automatic)

The user's active Claude Code session has a PreToolUse hook that runs
`broadcast-check.ts` before every tool call. This script:

1. Reads `~/.claude/workflow-adapter/broadcast/pending/` for `.json` files
2. Parses and formats each message
3. Outputs them to stdout (which Claude sees as hook feedback)
4. Moves delivered messages to `~/.claude/workflow-adapter/broadcast/archive/`

The receiving Claude is instructed to relay messages to the user immediately,
even if mid-task. The overhead is negligible (~2-5ms) when no messages are pending.

## Directory structure

```
~/.claude/workflow-adapter/broadcast/
├── pending/    ← new messages go here
└── archive/    ← delivered messages are moved here
```

## Checking messages manually

If the user asks to check broadcast messages or you want to see the archive:

```bash
# Pending messages (not yet delivered)
ls ~/.claude/workflow-adapter/broadcast/pending/

# Delivered messages
ls ~/.claude/workflow-adapter/broadcast/archive/
```

## Example: scheduled coffee order notification

A scheduled Claude agent that runs at 4pm to order coffee would:

```bash
# After placing the order successfully...
bun "${CLAUDE_PLUGIN_ROOT}/scripts/broadcast-send.ts" \
  --from "coffee-scheduler" \
  --subject "☕ 커피 주문 완료" \
  --body "아이스 아메리카노 1잔 주문 완료. 주문번호 #1234. 약 5분 후 픽업." \
  --priority normal
```

The user's active terminal session sees this on the next tool call and Claude
tells them: "커피 주문이 완료됐습니다! 주문번호 #1234, 약 5분 후 픽업 가능합니다."
