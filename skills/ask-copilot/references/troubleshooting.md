# Troubleshooting

## Health Check Flow

`copilot-client.ts`는 서버 모드에서 다음 순서로 health-check를 수행한다:

1. **Port 파일 확인**: `copilot-server-port.{session}.conf` 파일이 없으면 서버 미시작
   - 에러: `"No active copilot server found. Start with: bun scripts/copilot-server-start.ts"`
2. **다중 세션 감지**: 세션이 여러 개면 `--session` 지정 필요
   - 에러: `"Multiple sessions found. Specify --session: ..."`
3. **Ping 확인**: 서버에 JSON-RPC ping을 보내 pong 응답 확인
   - 에러: `"Server not responding. Restart: bun scripts/copilot-server-start.ts"`
4. **응답 대기**: 프롬프트 전송 후 응답 수집 (기본 타임아웃: 60초)
   - 에러: `"Server timed out. Check server logs."`

## 문제 해결 가이드

| 증상 | 원인 | 해결 |
|------|------|------|
| "No active copilot server found" | 서버가 실행되지 않음 | `bun scripts/copilot-server-start.ts` 실행 |
| "Multiple sessions found" | 여러 서버가 실행 중 | `--session NAME` 지정 |
| "Server not responding" | 서버 프로세스가 죽음 | `bun scripts/copilot-server-stop.ts --all` 후 재시작 |
| 타임아웃 | 서버가 응답을 생성하지 못함 | `--timeout` 값 증가, 서버 로그 확인 |
| 인증 에러 | Copilot CLI 인증 만료 | `copilot auth login` 실행 후 서버 재시작 |
| 서버 시작 실패 | 포트 충돌 또는 바이너리 없음 | 다른 포트 지정 (`--port`), CLI 설치 확인 |

## 서버 로그 확인

```bash
cat copilot-server.{session}.log
```

세션 이름은 서버 시작 시 출력된다:
```
[copilot-server] Session 'f3a1b2' started on port 4321
[copilot-server] Log: copilot-server.f3a1b2.log
```
