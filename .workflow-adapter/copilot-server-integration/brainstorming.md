# Brainstorming: copilot-server-integration

## Subject
Copilot CLI를 모든 권한을 줘서 server mode로 원하는 위치에 실행시키고, 열린 포트로 MCP server나 skills script를 통해 요청을 보내서 활용하는 방안 검토. copilot-sdk 레포 참조.

## Context (from Historian)

### Project Evolution
- `copilot-exec.sh` → `copilot-exec.ts` (commit `ad8258f`): shell에서 TypeScript로 마이그레이션
- `copilot-exec.ts`: one-shot CLI 프로세스 (`-p` prompt, `--allow-all-tools`, `--autopilot`)
- `copilot_chat.py`: JSON-RPC client로 running Copilot CLI server에 TCP 연결 (이미 서버 모드 패턴 존재)
- `ask-copilot` skill: pre-started server를 전제하고 `copilot-server-port.conf`에서 포트 읽음
- 프로젝트 패턴: **점진적 개선** (shell → TS, one-shot → server)

### Key Historical Decisions
- Copilot 모델 기본값: `gpt-5.3-codex` (commit `2919e4e`)
- copilot mode 추가 (commit `16ce573`): `--copilot` 플래그로 모든 execute skills에 적용
- Task delegation directives 추가 (commit `f039b17`): copilot mode 명시적 위임

### Technical Debt
- `copilot_chat.py`는 PoC 수준: connection retry, error handling, session reuse 없음
- `copilot-server-port.conf` 관리가 수동적 (서버 시작/종료 스크립트 부재)

## Research Findings (from Researcher)

### Copilot CLI Headless Server Mode
```bash
copilot --headless --port 4321
```
- TCP 기반 JSON-RPC 2.0 (LSP-style `Content-Length` framing)
- 다수 SDK 클라이언트가 하나의 서버 공유 가능
- 세션 상태: `~/.copilot/session-state/{sessionId}/`
- 30분 idle timeout

### @github/copilot-sdk (Node.js)
- `cliUrl` 옵션으로 외부 headless 서버에 연결
- `approveAll` 또는 `onPreToolUse` hook으로 권한 제어
- MCP server **소비** 가능 (mcpServers config), 하지만 MCP server로 **노출**은 별도 wrapper 필요
- Skill directories 로딩 지원
- **Technical Preview** 상태 (API 변경 가능)

### Authentication
우선순위: `githubToken` > `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > CLI login > gh auth > BYOK

### JSON-RPC Protocol Methods
- `ping` → `pong`
- `session.create` → `session.start` (sessionId)
- `session.send` → `assistant.message_delta` 스트리밍 → `session.idle`
- Tool events: `tool.execution_start`, `tool.execution_complete`

### Integration Approaches Evaluated

| Approach | 설명 | 판정 |
|----------|------|------|
| **A: MCP Wrapper** | Copilot을 MCP server로 감싸기 | 기각 — 불필요한 추상화 레이어 |
| **B: SDK Direct** | Skills script에서 SDK 직접 사용 | 기반 채택 |
| **B+: Enhanced SDK** | B + lifecycle 관리 + scoped security | **최종 채택** |
| **C: Hybrid** | Daemon + MCP + Skills | 기각 — 과잉 설계 |

## Discussion Summary

### 핵심 논쟁: Hybrid (C) vs Enhanced SDK (B+)

**Researcher 초기 추천**: Approach C (Hybrid — managed daemon + MCP wrapper + skills scripts)

**Reviewer 도전**:
1. MCP wrapper가 실제 가치를 더하는가? Claude Code는 skills script를 직접 호출 가능
2. `approveAll` + persistent server = 보안 리스크 확대
3. SDK가 Technical Preview인데 전면 의존하는 것은 시기상조
4. Daemon/session pool은 현재 사용 사례 대비 과잉 설계

**Researcher 수정**: C → B+ 로 피봇
- MCP wrapper 제거 (필요 시에만 Phase 3)
- Daemon 제거, 수동 서버 관리
- SDK 얇은 adapter 패턴으로 변경 리스크 최소화

**Historian 지원**: 프로젝트의 점진적 개선 패턴 (shell→TS, one-shot→server)에 B+가 자연스러운 다음 단계

### Points of Agreement
1. **Server mode 방향은 올바름**: 기존 `copilot_chat.py` + `ask-copilot`이 이미 이 패턴을 사용 중
2. **MCP wrapper는 당장 불필요**: Claude Code가 skills script를 직접 호출 가능
3. **점진적 마이그레이션**: Python fallback 유지하면서 SDK 클라이언트 추가
4. **localhost only 바인딩**: 네트워크 보안의 기본
5. **사용자 수동 서버 관리**: auto-start/watchdog 불필요

### Points of Contention (Resolved)
1. **과잉 설계 여부**: Hybrid C → B+ 로 피봇하여 해결
2. **SDK Preview 리스크**: 얇은 adapter 패턴 + pinned version + Python fallback으로 해결
3. **보안 모델**: `approveAll` 대신 scoped permissions로 해결 → **사용자 결정으로 최종 변경** (아래 User Decisions 참조)

## User Decisions

1. **권한 모델**: 사전 하드코딩된 tier 대신, **실행 시 사용자에게 물어서 결정**. 어떤 권한을 줄지는 사용자가 알아서 선택.
2. **모델 선택**: 기본값 하드코딩 대신, **실행 시 사용자에게 물어서 결정**. 어떤 모델을 쓸지는 사용자가 선택.
3. **MCP wrapper 제외**: 당장은 불필요, 구체적 필요 발생 시에만 구현

## Key Conclusions

### 최종 추천: Approach B+ (Enhanced SDK Scripts)

**Phase 1: Server Lifecycle (즉시)**
- `scripts/copilot-server-start.ts` (~50 lines): `copilot --headless --port PORT` 시작, port 파일 기록, ping 검증
- `scripts/copilot-server-stop.ts` (~30 lines): 서버 종료, port 파일 제거
- `ask-copilot` skill에 health-check 추가 (ping before send)

**Phase 2: SDK Client Migration (트리거 조건 충족 시)**
트리거: tool execution events 필요, session reuse 필요, SDK GA 출시, 또는 copilot_chat.py 한계 도달
- `scripts/copilot-sdk-client.ts` (~150 lines): SDK 기반 클라이언트
- `scripts/copilot-adapter.ts` (~50 lines): 얇은 SDK wrapper (API 변경 시 이것만 수정)
- 권한/모델은 실행 시 사용자에게 물어서 결정
- `copilot_chat.py`는 fallback으로 유지

**Phase 3: MCP Wrapper (필요 시에만)**
- 다른 AI agent가 Copilot을 호출해야 할 때만 구현
- `@modelcontextprotocol/sdk`로 ~200-300 lines 예상

### Server Lifecycle
```
User starts: bun scripts/copilot-server-start.ts [--port 4321]
User stops:  bun scripts/copilot-server-stop.ts 또는 Ctrl+C
Port file:   copilot-server-port.conf (존재 = 서버 실행 중 기대)
Crash:       Skills가 "server not running" 보고, 사용자가 재시작
```

### Health Check Flow
```
ask-copilot skill 호출
  → copilot-server-port.conf 읽기
    → 파일 없음? → "서버 미시작. 실행: bun scripts/copilot-server-start.ts"
  → localhost:PORT ping
    → 응답 없음? → "서버 응답 없음. 재시작 필요"
  → 프롬프트 전송, 응답 수집
    → 타임아웃? → "서버 타임아웃. 로그 확인"
  → 응답 반환
```

## Open Questions

1. **고정 포트 vs 동적 포트**: 고정이 설정 단순, 동적이 충돌 방지 (Phase 1에서 결정 → 세션별 분리로 해결)
2. **BYOK 지원**: GitHub 구독 없이 자체 API 키로 Copilot runtime 사용 (Phase 4+ 고려)
3. **멀티 프로젝트**: 여러 프로젝트에서 동시에 같은 서버 사용할지 (세션별 분리로 해결)
4. **양방향 대화 (Phase 2)**: SDK의 `onAskUser` 콜백으로 Copilot이 사용자에게 질문 → Claude Code가 중계 → 답변을 Copilot에 전달하는 interactive dialogue. 현재 CLI one-shot 방식에서는 불가능, SDK 마이그레이션 시 구현 가능.

## Review Notes (from Reviewer)

**Status: Conditional PASS**

**조건 (모두 충족됨):**
1. localhost only 바인딩 — 충족 (headless 기본값)
2. Scoped permissions — 충족 → 사용자 런타임 결정으로 더 단순화됨
3. SDK 변경 리스크 최소화 — 충족 (thin adapter + pinned version + Python fallback)

**Warnings (acknowledged):**
- SDK Technical Preview 상태: API 변경 시 adapter 수정 필요 (수용)
- 30분 idle timeout: 장시간 작업 시 세션 만료 가능 (사용자가 인지하면 됨)

**최종 평가:**
B+는 프로젝트의 점진적 개선 패턴에 부합하고, 현재 사용 사례에 필요 충분한 수준. 과잉 설계를 피하면서 확장 가능성을 열어둔 합리적 접근.
