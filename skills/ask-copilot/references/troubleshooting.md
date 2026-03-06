# Troubleshooting

## 문제 해결 가이드

| 증상 | 원인 | 해결 |
|------|------|------|
| `copilot CLI not found` | Copilot CLI 미설치 또는 PATH에 없음 | `copilot` 설치 또는 `COPILOT_CLI_PATH` 환경변수 설정 |
| `Initialize failed` | ACP 프로토콜 핸드셰이크 실패 | Copilot CLI 버전 확인 (`copilot --version`, 0.0.410+ 필요) |
| `Session creation failed` | 세션 생성 실패 | 인증 상태 확인 (`copilot auth login`) |
| `Prompt failed` | 프롬프트 전송/응답 실패 | 네트워크 상태 확인, `COPILOT_DEBUG=1` 설정 후 재실행 |
| `Timed out after Ns` | 타임아웃 (기본 120초) | `--timeout` 값 증가 |
| `No response text received` (WARNING) | 응답은 왔지만 텍스트 비어있음 | 프롬프트가 도구 실행만 유발했을 수 있음 (정상) |
| 인증 에러 | Copilot CLI 인증 만료 | `copilot auth login` 실행 |

## 디버깅

ACP 통신 로그를 보려면 환경변수를 설정한다:

```bash
COPILOT_DEBUG=1 bun scripts/copilot-client.ts --prompt "test"
```

Copilot의 stderr 출력이 `[copilot-acp]` 접두사로 표시된다.
