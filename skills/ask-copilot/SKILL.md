---
name: ask-copilot
description: "This skill should be used when the user asks to \"ask copilot\", \"copilot한테 물어봐\", \"copilot에게 질문\", \"copilot에게 질문해\", \"copilot 의견\", \"copilot 의견 들어봐\", \"copilot chat\", \"코파일럿한테 물어봐\", \"코파일럿에게 질문\", or wants to send a message to the GitHub Copilot agent running locally."
version: 0.1.0
---

# Ask Copilot

로컬에서 실행 중인 GitHub Copilot CLI 서버에 JSON-RPC 2.0 프로토콜로 메시지를 보내고 응답을 받는 스킬.

## Prerequisites

- Copilot CLI 서버가 실행 중이어야 함
- `copilot-server-port.conf` 파일에 포트 번호가 기록되어 있어야 함

## Usage

사용자의 메시지를 Copilot에게 전달하려면:

```bash
python "${CLAUDE_PLUGIN_ROOT}/skills/ask-copilot/scripts/copilot_chat.py" "사용자 메시지"
```

포트 파일이 기본 위치(`copilot-server-port.conf`)가 아닌 경우:
```bash
python "${CLAUDE_PLUGIN_ROOT}/skills/ask-copilot/scripts/copilot_chat.py" --port-file /path/to/port.conf "사용자 메시지"
```

## Workflow

1. 사용자가 Copilot에게 보낼 메시지를 전달하면, 위 스크립트를 실행한다.
2. 스크립트 출력(Copilot의 응답)을 사용자에게 그대로 보여준다.
3. 서버 연결 실패 시 에러 메시지를 사용자에게 안내한다.

## Notes

- Copilot 서버는 IPv6 `::1` (localhost)로 접속한다.
- 프로토콜: LSP-style framing (`Content-Length` 헤더) + JSON-RPC 2.0
- 스트리밍 응답을 수집하여 완성된 텍스트를 반환한다.
