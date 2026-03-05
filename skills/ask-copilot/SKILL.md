---
name: ask-copilot
description: "This skill should be used when the user asks to \"ask copilot\", \"ask GitHub Copilot\", \"send to copilot\", \"get copilot's opinion\", \"copilot help\", \"copilot chat\", \"copilot한테 물어봐\", \"copilot에게 질문\", \"copilot에게 질문해\", \"copilot 의견\", \"copilot 의견 들어봐\", \"코파일럿한테 물어봐\", \"코파일럿에게 질문\", or wants to send a message to the GitHub Copilot agent running locally via JSON-RPC."
version: 0.4.0
---

# Ask Copilot

Send a message to the locally running GitHub Copilot CLI server and return the response.

## Prerequisites

- Copilot CLI 설치 필요 (`copilot` 또는 `$COPILOT_CLI_PATH`)
- 서버가 자동으로 시작됨 (수동 시작도 가능)

## Workflow

1. 사용자의 메시지를 아래 명령으로 Copilot에게 전달한다:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --prompt "사용자 메시지"
   ```
   서버가 실행 중이 아니면 자동으로 시작된다.
2. 스크립트 출력(Copilot의 응답)을 사용자에게 그대로 보여준다.
3. 에러 발생 시 `references/troubleshooting.md` 참조.

## Server Lifecycle

```bash
# 서버 시작 (세션 ID 자동 생성)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-server-start.ts" [--port 4321] [--model MODEL]

# 특정 세션으로 시작
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-server-start.ts" --session my-session --port 4321

# 세션 종료 (하나일 때 자동 감지)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-server-stop.ts"

# 모든 세션 종료
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-server-stop.ts" --all
```

## Usage Variants

```bash
# 특정 세션 지정
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --session abc123 --prompt "메시지"

# CLI one-shot 모드 (서버 불필요)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --cli --prompt "메시지"
```
