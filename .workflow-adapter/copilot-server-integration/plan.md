# Execution Plan: copilot-server-integration (Phase 1)

## Overview
Copilot CLI headless server의 lifecycle 관리 스크립트를 추가하고, ask-copilot 스킬에 health-check 문서를 보강한다. 사용자가 `bun scripts/copilot-server-start.ts` 한 줄로 서버를 시작하고, 모델/권한/포트를 런타임에 선택할 수 있게 한다. 또한 기존 `copilot-exec.ts`의 stdout 캡처 문제를 수정한다.

## Configuration
- **Worktree**: No
- **Executers**: 1 (executer-alpha)

## Tasks

### Task 1: Extract shared copilot-utils.ts
- **Assigned to**: executer-alpha
- **Dependencies**: None
- **Status**: [x] Completed
- **Description**:
  `copilot-exec.ts`와 새로 만들 스크립트들이 공유할 유틸리티를 먼저 추출.
  1. `scripts/copilot-utils.ts` 생성
  2. `findCopilot()` 함수 export (copilot-exec.ts에서 추출)
  3. `readPortFile(path?)` 함수 export (port 파일 읽기 공통 로직)
  4. `pingServer(port)` 함수 export (JSON-RPC ping/pong 확인)
  5. `copilot-exec.ts`에서 `findCopilot()`를 import로 교체

- **Completion Criteria**:
  1. `copilot-utils.ts`에 `findCopilot`, `readPortFile`, `pingServer` export 존재
  2. `copilot-exec.ts`가 `findCopilot`를 import하여 기존과 동일하게 동작
  3. `bun scripts/copilot-exec.ts --prompt-file <test>` 회귀 테스트 통과
- **Verification Method**:
  1. `copilot-exec.ts` 기존 기능 동작 확인 (--prompt-file 테스트)
  2. `copilot-utils.ts` export 확인
- **Changes**: Created `scripts/copilot-utils.ts` with `findCopilot()`, `readPortFile()`, `pingServer()`. Updated `copilot-exec.ts` to import `findCopilot` from `copilot-utils.ts` and removed local definition. Both files compile successfully.

### Task 2: Create unified copilot-client.ts
- **Assigned to**: executer-alpha
- **Dependencies**: Task 1
- **Status**: [x] Completed
- **Description**:
  `copilot-exec.ts` (one-shot `-p`)와 `copilot_chat.py` (server JSON-RPC)를 통합하는 `scripts/copilot-client.ts` 생성.

  **두 가지 모드:**
  1. **기본 (server mode)**: headless server에 JSON-RPC 연결
     - `readPortFile()`로 포트 읽기 → `pingServer()`로 확인 → session create → send prompt → collect response
     - 서버 미실행 시 명확한 에러: "Server not running. Start: bun scripts/copilot-server-start.ts"
     - stdout: `"pipe"` + relay (캡처 가능)
  2. **`--cli` (one-shot mode)**: `copilot -p "prompt"` 직접 실행 (현재 copilot-exec.ts 방식)
     - `findCopilot()`로 바이너리 찾기 → spawn with `-p`, `--allow-all-tools`, `--autopilot`
     - stdout: `"pipe"` + relay (캡처 가능). `--cli --interactive` 시 `"inherit"`
     - 서버 불필요

  **인터페이스:**
  ```bash
  # Server mode (기본)
  bun scripts/copilot-client.ts --prompt "질문"
  bun scripts/copilot-client.ts --prompt-file /tmp/prompt.md

  # CLI one-shot mode
  bun scripts/copilot-client.ts --cli --prompt "질문"
  bun scripts/copilot-client.ts --cli --prompt-file /tmp/prompt.md
  bun scripts/copilot-client.ts --cli --interactive  # stdout: inherit (터미널 직접)

  # Options
  --model MODEL      모델 지정 (기본: gpt-5.3-codex)
  --timeout SECS     타임아웃 (기본: 60 server, 600 cli)
  --port-file PATH   port 파일 경로 (server mode)
  ```

  **기존 파일 처리:**
  - `copilot-exec.ts`: 유지 (backward compat), 내부적으로 copilot-client.ts --cli 호출하도록 thin wrapper화
  - `copilot_chat.py`: 유지 (fallback), 변경 없음

  참조 파일:
  - `scripts/copilot-exec.ts`: CLI mode 로직, arg parsing
  - `skills/ask-copilot/scripts/copilot_chat.py`: server mode JSON-RPC 프로토콜
  - `scripts/copilot-utils.ts`: findCopilot, readPortFile, pingServer

- **Completion Criteria**:
  1. Server mode: `bun scripts/copilot-client.ts --prompt "hello"` → 서버에 연결하여 응답 반환
  2. CLI mode: `bun scripts/copilot-client.ts --cli --prompt "hello"` → one-shot 실행 후 응답 반환
  3. 캡처 가능: `bun scripts/copilot-client.ts --prompt "hello" > /tmp/out.txt` → out.txt에 내용
  4. 서버 미실행 시 server mode → 명확한 에러 메시지
  5. copilot CLI 미설치 시 cli mode → 명확한 에러 메시지
  6. `copilot-exec.ts`가 thin wrapper로 동작 (기존 인터페이스 유지)
- **Verification Method**:
  1. Server mode: 서버 시작 후 `--prompt "hello"` → 응답 확인
  2. CLI mode: `--cli --prompt "hello"` → 응답 확인
  3. 캡처: `> /tmp/out.txt` 후 파일 내용 확인
  4. `copilot-exec.ts --prompt-file /tmp/test.md` → 기존과 동일하게 동작 (회귀)
- **Changes**: Created `scripts/copilot-client.ts` with server mode (JSON-RPC) and CLI mode (--cli). Converted `copilot-exec.ts` to thin wrapper delegating to `copilot-client.ts --cli`.

### Task 3: Create copilot-server-start.ts
- **Assigned to**: executer-alpha
- **Dependencies**: Task 1
- **Status**: [x] Completed
- **Description**:
  `scripts/copilot-server-start.ts` 생성 (~60 lines). 기능:
  1. `findCopilot()` from `copilot-utils.ts`
  2. CLI args 파싱: `--port PORT` (기본값 4321), `--model MODEL` (선택), `--mode readonly|edit|full` (선택)
     - model, mode 미지정 시: 사용자가 런타임에 선택하는 것을 전제 (Phase 2 SDK client에서 처리, Phase 1에서는 args pass-through)
  3. `copilot --headless --port PORT` 프로세스 시작 (Bun.spawn)
     - stdout/stderr를 파일로 기록: `copilot-server.log`
  4. 포트 번호를 `copilot-server-port.conf`에 기록
  5. `pingServer(port)` from `copilot-utils.ts`로 pong 확인 (최대 10초 대기, 1초 간격 retry)
  6. 성공 시 "Copilot server started on port PORT" 출력
  7. 실패 시 프로세스 kill, port 파일 삭제, 에러 출력
  8. 이미 서버 실행 중 (port 파일 존재 + ping 성공) → "Server already running on port PORT" 출력, exit 0

  참조 파일:
  - `scripts/copilot-utils.ts`: findCopilot, pingServer
  - `skills/ask-copilot/scripts/copilot_chat.py`: JSON-RPC 프로토콜 참조
  - `.workflow-adapter/copilot-server-integration/doc/final-proposal-b-plus.md`: 보안 모델

- **Completion Criteria**:
  1. `bun scripts/copilot-server-start.ts` 실행 시 copilot CLI가 headless mode로 시작됨
  2. `copilot-server-port.conf` 파일에 포트 번호가 기록됨
  3. 서버 시작 후 ping 검증 성공
  4. copilot CLI 없을 때 명확한 에러 메시지
  5. 중복 시작 시 기존 서버 정보 출력, 새 프로세스 생성하지 않음
  6. 서버 로그가 `copilot-server.log`에 기록됨
- **Verification Method**:
  1. `bun scripts/copilot-server-start.ts --port 4321` → 서버 시작 확인
  2. `cat copilot-server-port.conf` → 포트 번호 확인
  3. `copilot_chat.py "hello"` → 응답 수신
  4. 같은 명령 재실행 → "already running" 메시지
- **Changes**: Created `scripts/copilot-server-start.ts` with --port/--model/--mode args, duplicate-start protection, ping verification (10s timeout), log file output, and port file management.

### Task 4: Create copilot-server-stop.ts
- **Assigned to**: executer-alpha
- **Dependencies**: Task 3
- **Status**: [x] Completed
- **Description**:
  `scripts/copilot-server-stop.ts` 생성 (~30 lines). 기능:
  1. `readPortFile()` from `copilot-utils.ts`
  2. `pingServer(port)` → 서버 실행 중 확인
  3. 서버 프로세스 종료 (`lsof -ti :PORT | xargs kill` 또는 PID 파일 사용)
  4. `copilot-server-port.conf` 삭제
  5. `copilot-server.log`는 유지 (디버깅용)
  6. port 파일 없을 때 "서버가 실행 중이지 않습니다" 메시지, exit 0

- **Completion Criteria**:
  1. `bun scripts/copilot-server-stop.ts` 실행 시 서버 프로세스 종료됨
  2. `copilot-server-port.conf` 삭제됨
  3. 서버 미실행 상태에서 실행 시 에러 없이 안내 메시지
- **Verification Method**:
  1. Task 3으로 서버 시작 → Task 4로 종료 → port 파일 삭제 확인
  2. 종료 후 `copilot_chat.py` → 연결 실패 확인
  3. 서버 없는 상태에서 stop → 에러 없이 종료
- **Changes**: Created `scripts/copilot-server-stop.ts` using lsof to find/kill process, removes port file, graceful handling when not running.

### Task 5: Update ask-copilot SKILL.md
- **Assigned to**: executer-alpha
- **Dependencies**: Task 3, Task 4
- **Status**: [x] Completed
- **Description**:
  `skills/ask-copilot/SKILL.md` 업데이트:
  1. Prerequisites에 서버 시작 명령어 추가: `bun scripts/copilot-server-start.ts`
  2. Health-check 동작 문서화: port 파일 없음 → 서버 미시작 안내, ping 실패 → 재시작 안내
  3. 서버 종료 명령어: `bun scripts/copilot-server-stop.ts`
  4. Troubleshooting 섹션 추가 (서버 안 뜸, 타임아웃, 인증 에러, 로그 확인 방법)
  5. `copilot-server.log` 위치 안내

- **Completion Criteria**:
  1. SKILL.md에 서버 시작/종료 명령어 명시
  2. Health-check 에러 시나리오별 안내 문서화
  3. 기존 Usage 섹션과 일관성 유지
- **Verification Method**:
  1. SKILL.md 읽어서 서버 lifecycle 명령어 존재 확인
  2. Prerequisites가 새 스크립트 참조 확인
- **Changes**: Updated SKILL.md with server start/stop commands in Prerequisites, Server Lifecycle section, Health Check flow documentation, Troubleshooting table, copilot-client.ts usage, and log file reference.

### Task 6: Add .gitignore entries
- **Assigned to**: executer-alpha
- **Dependencies**: Task 3
- **Status**: [x] Completed
- **Description**:
  런타임 파일들이 git에 커밋되지 않도록 .gitignore에 추가:
  - `copilot-server-port.conf`
  - `copilot-server.log`

- **Completion Criteria**:
  1. `.gitignore`에 두 파일 패턴이 존재
  2. `git status`에서 해당 파일들이 untracked으로 표시되지 않음
- **Verification Method**:
  1. `.gitignore` 내용 확인
- **Changes**: Created `.gitignore` with `copilot-server-port.conf` and `copilot-server.log` entries.

## Verification Plan
- [ ] `bun scripts/copilot-server-start.ts --port 4321` → 서버 시작 성공
- [ ] `bun scripts/copilot-client.ts --prompt "hello"` → server mode 응답 수신
- [ ] `bun scripts/copilot-client.ts --cli --prompt "hello"` → CLI one-shot 응답 수신
- [ ] `bun scripts/copilot-client.ts --prompt "hello" > /tmp/out.txt` → 캡처 확인
- [ ] `bun scripts/copilot-server-stop.ts` → 서버 종료 + port 파일 삭제
- [ ] 서버 미실행 상태에서 server mode → 명확한 에러 메시지
- [ ] `copilot-exec.ts --prompt-file` → 기존 인터페이스 회귀 테스트
- [ ] `.gitignore`에 런타임 파일 패턴 존재

## Progress Log
(to be filled during execution)
