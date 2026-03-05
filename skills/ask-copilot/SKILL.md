---
name: ask-copilot
description: "This skill should be used when the user asks to \"ask copilot\", \"copilot한테 물어봐\", \"copilot에게 질문\", \"copilot에게 질문해\", \"copilot 의견\", \"copilot 의견 들어봐\", \"copilot chat\", \"코파일럿한테 물어봐\", \"코파일럿에게 질문\", or wants to send a message to the GitHub Copilot agent running locally."
version: 0.2.0
---

# Ask Copilot

로컬에서 실행 중인 GitHub Copilot CLI 서버에 JSON-RPC 2.0 프로토콜로 메시지를 보내고 응답을 받는 스킬.

## Prerequisites

- Copilot CLI가 설치되어 있어야 함 (`copilot` 또는 `$COPILOT_CLI_PATH`)
- Copilot CLI 서버가 실행 중이어야 함:
  ```bash
  bun scripts/copilot-server-start.ts [--port 4321] [--model MODEL]
  ```
- `copilot-server-port.conf` 파일에 포트 번호가 기록되어 있어야 함 (서버 시작 시 자동 생성)

## Usage

사용자의 메시지를 Copilot에게 전달하려면:

```bash
bun scripts/copilot-client.ts --prompt "사용자 메시지"
```

포트 파일이 기본 위치(`copilot-server-port.conf`)가 아닌 경우:
```bash
bun scripts/copilot-client.ts --port-file /path/to/port.conf --prompt "사용자 메시지"
```

## Server Lifecycle

```bash
# 서버 시작
bun scripts/copilot-server-start.ts [--port 4321] [--model MODEL] [--mode readonly|edit|full]

# 서버 종료
bun scripts/copilot-server-stop.ts
```

서버는 시작 시 자동으로 health-check (ping/pong)를 수행하며, 최대 10초간 대기한다.

## Workflow

1. 사용자가 Copilot에게 보낼 메시지를 전달하면, 위 스크립트를 실행한다.
2. 스크립트 출력(Copilot의 응답)을 사용자에게 그대로 보여준다.
3. 서버 연결 실패 시 에러 메시지를 사용자에게 안내한다.

## Health Check

스크립트 실행 시 다음 순서로 health-check가 수행된다:

1. **Port 파일 확인**: `copilot-server-port.conf` 파일이 없으면 서버가 시작되지 않은 것
   - 안내: `"Server not started. Run: bun scripts/copilot-server-start.ts"`
2. **Ping 확인**: 서버에 JSON-RPC ping을 보내 pong 응답을 확인
   - 실패 시 안내: `"Server not responding. Restart: bun scripts/copilot-server-start.ts"`
3. **응답 대기**: 프롬프트 전송 후 응답 수집 (기본 타임아웃: 60초)
   - 타임아웃 시 안내: `"Server timed out. Check server logs."`

## Troubleshooting

| 증상 | 원인 | 해결 |
|------|------|------|
| "Server not started" | 서버가 실행되지 않음 | `bun scripts/copilot-server-start.ts` 실행 |
| "Server not responding" | 서버 프로세스가 죽었거나 포트가 다름 | `bun scripts/copilot-server-stop.ts` 후 재시작 |
| 타임아웃 | 서버가 응답을 생성하지 못함 | `--timeout` 값 증가, 서버 로그 확인 |
| 인증 에러 | Copilot CLI 인증 만료 | `copilot auth login` 실행 후 서버 재시작 |
| 서버 시작 실패 | 포트 충돌 또는 바이너리 없음 | 다른 포트 지정 (`--port`), CLI 설치 확인 |

서버 로그 확인:
```bash
cat copilot-server.log
```

## Notes

- Copilot 서버는 IPv6 `::1` (localhost)로 접속한다.
- 프로토콜: LSP-style framing (`Content-Length` 헤더) + JSON-RPC 2.0
- 스트리밍 응답을 수집하여 완성된 텍스트를 반환한다.
