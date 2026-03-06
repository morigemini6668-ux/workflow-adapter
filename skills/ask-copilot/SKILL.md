---
name: ask-copilot
description: "This skill should be used when the user asks to \"ask copilot\", \"ask GitHub Copilot\", \"send to copilot\", \"get copilot's opinion\", \"copilot help\", \"copilot chat\", \"copilot한테 물어봐\", \"copilot에게 질문\", \"copilot에게 질문해\", \"copilot 의견\", \"copilot 의견 들어봐\", \"코파일럿한테 물어봐\", \"코파일럿에게 질문\", or wants to send a message to the GitHub Copilot agent running locally via JSON-RPC."
version: 0.5.0
---

# Ask Copilot

GitHub Copilot CLI에 프롬프트를 전송하고 응답을 반환한다.

## Prerequisites

- Copilot CLI 설치 필요 (`copilot` 또는 `$COPILOT_CLI_PATH`)

## Workflow

1. 사용자의 메시지를 아래 명령으로 Copilot에게 전달한다:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --prompt "사용자 메시지"
   ```
   ACP 모드(Agent Client Protocol)로 copilot CLI를 one-shot 실행한다.
2. 스크립트 출력(Copilot의 응답)을 사용자에게 그대로 보여준다.
3. 에러 발생 시 `references/troubleshooting.md` 참조.

## Usage Variants

```bash
# 기본 (ACP 모드)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --prompt "메시지"

# 파일에서 프롬프트 읽기 (긴 프롬프트)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --prompt-file path/to/prompt.txt

# CLI one-shot 모드 (copilot -p 직접 실행)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --cli --prompt "메시지"

# 모델 지정
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --model gpt-5.4 --prompt "메시지"

# 타임아웃 지정 (기본: ACP 120초, CLI 600초)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-client.ts" --timeout 300 --prompt "메시지"
```
