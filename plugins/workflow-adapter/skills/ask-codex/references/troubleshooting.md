# Ask-Codex Troubleshooting

## codex CLI를 찾을 수 없음 (exit 127)

```
[codex-client] ERROR: codex CLI not found.
```

**원인**: `codex` 바이너리가 PATH에 없음.

**해결**:
1. `npm install -g @openai/codex` 로 설치
2. 또는 `CODEX_CLI_PATH` 환경 변수를 직접 설정:
   ```bash
   export CODEX_CLI_PATH=/path/to/codex
   ```

## 인증 오류

```
Error: authentication required
```

**해결**:
```bash
codex login
```

## 타임아웃 (exit 124)

```
[codex-client] ERROR: No activity for Ns, timed out
```

**원인**: Codex가 지정 시간 동안 응답하지 않음.

**해결**:
- `--timeout` 값을 늘림: `--timeout 600`
- 네트워크 연결 확인
- `CODEX_DEBUG=1`로 디버그 로그 활성화

## 응답 없음

```
[codex-client] WARNING: No response text received
```

**원인**: Codex가 실행은 완료했지만 agent_message를 출력하지 않음.

**해결**:
- `--cli` 모드로 전환해서 시도: `--cli --prompt "메시지"`
- 프롬프트가 너무 짧거나 모호하지 않은지 확인

## 디버그 모드

JSONL 모드에서 상세 로그를 보려면:
```bash
CODEX_DEBUG=1 bun scripts/codex-client.ts --prompt "메시지"
```

stderr에 codex의 원시 출력이 표시됨.
