# Internals

## 프로토콜

- **JSON-RPC 2.0** over TCP with LSP-style framing (`Content-Length` 헤더)
- 연결: IPv6 `::1` (localhost) 우선, fallback으로 IPv4 `127.0.0.1`

## JSON-RPC Methods

| Method | 설명 |
|--------|------|
| `ping` | 서버 상태 확인 → `{ message: "pong" }` |
| `session.create` | 세션 생성 → `session.start` 이벤트 (sessionId) |
| `session.send` | 프롬프트 전송 → 스트리밍 응답 → `session.idle` |

## 스트리밍 이벤트

| Event | 설명 |
|-------|------|
| `assistant.message_delta` | 응답 텍스트 조각 (delta) |
| `assistant.message` | 완성된 응답 텍스트 (있으면 delta보다 우선) |
| `tool.execution_start` | Copilot이 도구 실행 시작 |
| `tool.execution_complete` | Copilot이 도구 실행 완료 |
| `session.idle` | 응답 완료 마커 |

## 세션 관리

- 세션별 port 파일: `copilot-server-port.{session}.conf`
- 세션별 log 파일: `copilot-server.{session}.log`
- 세션 ID: `--session NAME` 또는 자동 생성 (6-char hex)
- 세션이 하나면 `--session` 생략 가능 (자동 감지)
- 30분 idle timeout (Copilot CLI 기본값)
