# Internals

## 프로토콜

- **ACP (Agent Client Protocol)**: `copilot --acp --stdio`로 실행
- **NDJSON** (newline-delimited JSON) over stdin/stdout
- One-shot 방식: 요청마다 copilot 프로세스를 spawn → 응답 수신 → 종료

## ACP 통신 흐름

```
Client                          Copilot CLI (--acp --stdio)
  │                                    │
  ├── initialize ──────────────────────►│
  │◄────────────── result (agentInfo) ──┤
  │                                    │
  ├── session/new (cwd, mcpServers) ───►│
  │◄──────────── result (sessionId) ───┤
  │                                    │
  ├── session/prompt (sessionId, prompt)►│
  │◄─── session/update (streaming) ────┤  (다수)
  │◄─── session/requestPermission ─────┤  (도구 실행 시)
  ├── result { permission: "allow" } ──►│
  │◄─── session/update (streaming) ────┤  (계속)
  │◄────────── result (stopReason) ────┤
  │                                    │
  └── kill process ────────────────────X│
```

## JSON-RPC Methods

| Method | Params | 설명 |
|--------|--------|------|
| `initialize` | `{ protocolVersion: 1, clientInfo, capabilities }` | 프로토콜 핸드셰이크 |
| `session/new` | `{ cwd: string, mcpServers: [] }` | 세션 생성 → sessionId 반환 |
| `session/prompt` | `{ sessionId, prompt: [{type:"text", text}] }` | 프롬프트 전송 |

## 스트리밍 이벤트 (session/update notifications)

| sessionUpdate | 설명 |
|---------------|------|
| `agent_message_chunk` | 응답 텍스트 조각 `{ content: { type: "text", text } }` |
| 기타 | 도구 실행, 상태 변경 등 |

## 권한 처리

- `--yolo` 플래그로 시작하므로 대부분 자동 승인
- ACP에서 `session/requestPermission` 요청이 오면 `{ permission: "allow" }`로 응답

## CLI 모드 (--cli)

`copilot -p "prompt" --yolo --autopilot --add-dir .` 로 직접 실행.
ACP 프로토콜 없이 copilot CLI의 one-shot prompt 모드를 사용한다.
