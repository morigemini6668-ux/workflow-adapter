# uniflow 수동 QA 체크리스트

## 사전 준비

```bash
cd plugins/uniflow
bun install
bun link        # uniflow 명령 전역 등록
```

이후 `uniflow` 대신 `uniflow` 명령으로 실행 가능.

---

## 1. CLI 기본 동작

```bash
# 도움말
uniflow --help
uniflow spawn --help

# 버전
uniflow --version

# Doctor (tmux, claude, codex 체크)
uniflow doctor

# Init (프로젝트 초기화)
uniflow init
cat .uniflow-id                    # 랜덤 이름 확인
uniflow init          # 재실행 → 같은 이름 유지 (멱등성)

# 에러 경로
uniflow status        # daemon 없이 → "Daemon not running" 에러
uniflow asdfgh        # 잘못된 명령 → "Unknown command" 에러
```

**확인 포인트:**
- [ ] `--help` → 19개 명령 목록 표시
- [ ] `doctor` → tmux, claude, codex 체크 결과 표시
- [ ] `init` → .uniflow-id 파일 생성
- [ ] `init` 재실행 → 기존 ID 유지
- [ ] daemon 없이 status → 에러 메시지 (crash 아님)

---

## 2. 자동 테스트 실행

```bash
# 전체 테스트 한방에 실행
bun run test/state.test.ts         # State Management (12개)
bun run test/tmux-mock.test.ts     # tmux mock (35개)
bun run test/ipc-full.test.ts      # IPC 14 commands (43개)
bun run test/exit-codes.test.ts    # exit codes + MAX_WORKERS (12개)
bun run test/e2e.ts                # 유닛 E2E (25개)
bun run test/cli-qa.ts             # CLI QA (35개)

# tmux 통합 (실제 tmux pane 생성됨 — 자동 정리)
bun run test/tmux-integration.test.ts   # 5개

# E2E Live (daemon + tmux — 7초 소요)
bun run test/e2e-live.test.ts      # 14개
```

**확인 포인트:**
- [ ] 각 테스트 파일 전부 PASS (총 181개)
- [ ] TypeScript 에러 없음: `bun check`

---

## 3. TUI 인터랙션

### 3a. daemon 없이 TUI (에러 상태)

```bash
uniflow tui
```

- [ ] 즉시 에러 메시지 출력 후 종료 (crash/stack trace 아님)

### 3b. daemon 있는 TUI

```bash
# 1) tmux 세션 안에서 실행
tmux new-session -s uniflow-test

# 2) daemon 시작 (orchestrator는 claude CLI 필요)
uniflow start

# 3) 다른 pane에서 TUI 실행
# Ctrl-b % 로 pane 분할 후:
uniflow tui
```

**키바인딩 테스트:**
- [ ] `Tab` → 패널 전환 (agents → tasks → events → agents)
- [ ] 활성 패널 굵은 테두리 (━)
- [ ] `r` → 수동 새로고침 (타임스탬프 변경)
- [ ] `f` → 필터 순환 (tasks 패널에서 pending/in_progress/completed/all)
- [ ] `q` → TUI 종료 (daemon은 유지)
- [ ] `Ctrl-C` → TUI 종료

**리사이즈 테스트:**
```bash
# tmux에서 pane 크기 조절
# Ctrl-b : resize-pane -x 80 -y 24
# Ctrl-b : resize-pane -x 120 -y 40
```
- [ ] 80x24 → 레이아웃 유지 (Events 텍스트 잘릴 수 있음 — known)
- [ ] 120x40 → 정상 렌더링

---

## 4. Worker Spawn + Task 할당

```bash
# daemon 실행 상태에서 다른 터미널에서:
uniflow spawn worker-1 --cli claude
uniflow spawn worker-2 --cli codex
uniflow task-add "Test task" --assign worker-1
uniflow status --json
uniflow agents
uniflow tasks
uniflow peek worker-1
uniflow logs worker-1 -n 20
```

**확인 포인트:**
- [ ] spawn → worker pane 생성됨 (tmux에서 확인)
- [ ] status --json → JSON 출력에 agents, tasks 포함
- [ ] agents → worker-1, worker-2 목록 표시
- [ ] tasks → "Test task" 표시, assignee = worker-1
- [ ] peek → worker pane 캡처 내용 출력

---

## 5. Graceful Shutdown

```bash
uniflow stop
```

- [ ] 모든 agent pane 종료됨
- [ ] 세션 archived (events.jsonl에 session_stopped 기록)
- [ ] `uniflow status` → "Daemon not running"

---

## 6. Edge Cases

```bash
# 존재하지 않는 agent
uniflow send nonexistent "hello"    # → exit code 3

# 중복 start
uniflow start &
uniflow start                        # → exit code 2

# 6번째 worker (MAX 5)
# 5개 spawn 후 6번째 시도 → "Max workers exceeded" 에러
```

- [ ] 없는 agent → exit code 3 + 에러 메시지
- [ ] 중복 start → exit code 2
- [ ] 6번째 worker → 거부

---

## 정리

```bash
rm -f .uniflow-id
rm -rf ~/.uniflow/projects/
uniflow stop 2>/dev/null; true
tmux kill-session -t uniflow-test 2>/dev/null; true
```
