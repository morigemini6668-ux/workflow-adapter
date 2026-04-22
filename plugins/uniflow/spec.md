# Technical Specification: tmux-agent-orchestration (uniflow)

> Generated from brainstorming.md. This spec provides the HOW
> for decisions made during brainstorming (the WHAT and WHY).

## 1. Technical Design Decisions

### Architecture Pattern

Three-component model with strict responsibility boundaries:

```
daemon (Bun process) ←── CLI API ───→ orchestrator agent (pane)
     ↕ files + send-keys                   ↕ uniflow CLI (Bash)
     ↕ Unix socket                         ↓
worker agents (panes) ←── inbox/outbox ──→ daemon
```

- **Daemon**: infrastructure layer (tmux, health, dispatch, IPC)
- **Orchestrator Agent**: intelligence layer (planning, assignment, evaluation)
- **Workers**: execution layer (task execution, status reporting)

### Technology / Framework Choices

| Technology | Justification | Reference |
|---|---|---|
| Bun | Native TS execution, fast Bun.spawn, atomic Bun.write, Ink TUI support | doc/04 (OMX uses Bun successfully) |
| TypeScript (strict) | Type safety for complex state management, same as OMX | doc/04 |
| Ink v6 + React 19 | secretary-factory validates Ink for tmux TUI panels | doc/07 |
| Zod | Runtime validation for JSON state files | — |
| tmux CLI via Bun.spawn | Direct tmux control without wrapper libraries | doc/01 |
| JSONL (append-only) | Lock-free concurrent writes from multiple agents | doc/02 |
| Unix domain socket | Daemon IPC for CLI/TUI communication | — |

### Component Structure

| Component | Responsibility | Depends On |
|---|---|---|
| `src/daemon/` | Monitoring loop, health checks, message dispatch, IPC server | tmux, fs |
| `src/daemon/tmux.ts` | tmux CLI wrapper (spawn, send-keys, capture-pane, paste-buffer) | Bun.spawn |
| `src/daemon/dispatch.ts` | Inbox write + trigger send (interrupt/nudge modes) | tmux.ts |
| `src/daemon/monitor.ts` | Health polling (5s), idle nudge (30s), crash detection | tmux.ts, fs.watch |
| `src/daemon/session.ts` | Session lifecycle (create, recover, archive) | fs |
| `src/cli/` | CLI command handlers, Unix socket client | — |
| `src/tui/` | Ink/React components for status viewer | Ink, daemon IPC |
| `src/templates/` | Orchestrator + worker instruction templates | — |
| `src/launch/` | CLI-specific agent launch (Claude Code, Codex) | tmux.ts |

## 2. Interface Contracts

### CLI ↔ Daemon IPC Protocol

Communication via Unix domain socket (`~/.uniflow/sockets/{project}.sock`):

```typescript
// Request: CLI → daemon
interface DaemonRequest {
  command: string;           // "spawn" | "kill" | "assign" | "send" | "status" | ...
  args: Record<string, unknown>;
  requestId: string;
}

// Response: daemon → CLI
interface DaemonResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Agent State (agents/{name}.json)

```typescript
interface AgentState {
  name: string;
  cli: 'claude' | 'codex';
  role: string;                              // "orchestrator" | "executor" | custom
  pane_id: string;                           // tmux pane id (e.g., "%42")
  pid: number;
  state: 'starting' | 'idle' | 'working' | 'blocked' | 'done' | 'failed';
  current_task: string | null;
  progress: string | null;
  nudge_count: number;
  started_at: string;                        // ISO 8601
  updated_at: string;
}
```

### Task Definition (tasks/{id}.json)

```typescript
interface Task {
  id: string;                                // "task-001"
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignee: string | null;                   // agent name
  priority: number;                          // 1-5, lower = higher
  depends_on: string[];                      // task IDs
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  result: string | null;
  error: string | null;
}
```

### Outbox Entry (outbox.jsonl — one line)

```typescript
interface OutboxEntry {
  agent: string;
  task: string;
  status: 'completed' | 'failed';
  summary: string;
  error?: string;
  files_changed?: string[];
  timestamp: string;                         // ISO 8601
}
```

### Inter-Component Communication

**Four-layer protocol:**

| Layer | Mechanism | Direction | Data |
|---|---|---|---|
| DATA | `inboxes/{name}.md` (Markdown) | daemon→agent | Task instructions (unlimited size) |
| DATA | `outbox.jsonl` (JSONL append) | agents→daemon | Task results (one line per result) |
| DATA | `agents/{name}.json` (JSON) | agent→daemon | Status updates |
| SIGNAL | `tmux paste-buffer` + `C-m` | daemon→agent | Short trigger text (< 60 chars) |
| CONTROL | Unix domain socket | CLI→daemon | Commands and queries |
| OBSERVE | `tmux capture-pane` | daemon←agent | Terminal output (read-only) |

### Delivery Modes

Task delivery는 daemon이 항상 주도한다. Worker의 instruction 기반 self-loop은 없다.

| Mode | 동작 | 사용 시점 |
|---|---|---|
| **Interrupt** | inbox 작성 → interrupt key(C-c/Escape) → trigger 전송 | 긴급, busy worker |
| **Nudge** | inbox 작성 → idle 확인(capture-pane) → trigger 전송 | idle worker에게 새 task |

Worker는 task 완료 후 단순히 idle 상태가 되고, daemon이 다음 task를 항상 nudge/interrupt로 전달한다.

### Message Delivery Interface

```typescript
interface DispatchOptions {
  mode: 'interrupt' | 'nudge';     // interrupt: 작업 중단 후 전달, nudge: idle일 때만
  message: string;                  // trigger text (< 60 chars)
}

// Interrupt keys per CLI
const INTERRUPT_KEY: Record<string, string> = {
  claude: 'C-c',
  codex: 'Escape',
};

// Submit press count per CLI
const SUBMIT_PRESSES: Record<string, number> = {
  claude: 1,
  codex: 2,
};
```

### File Format Specifications

**inbox.md** — daemon writes, agent reads, agent clears:
```
경로: ~/.uniflow/projects/{pid}/sessions/{sid}/inboxes/{name}.md
인코딩: UTF-8
최대 크기: 32 KB (초과 시 경고, 전달은 허용)
원자적 쓰기: tmp.{pid} → rename
```

**outbox.jsonl** — agents append, daemon reads with cursor:
```
경로: ~/.uniflow/projects/{pid}/sessions/{sid}/outbox.jsonl
인코딩: UTF-8
한 줄 < 4 KB (POSIX O_APPEND atomic 보장)
커서: 바이트 오프셋 기반
```

## 3. Non-Functional Requirements

### Performance Constraints

| Metric | Target |
|---|---|
| Message delivery (idle agent) | < 750ms |
| Message delivery (busy agent, interrupt) | < 1.5s |
| Health check cycle | 5s |
| Idle detection → nudge | 30s |
| Agent readiness (spawn → ready) | < 30s (timeout) |
| capture-pane call | < 1ms |
| Daemon memory footprint | < 50 MB |

### Security Considerations

- **Agent isolation**: worker instructions에 scope rule 명시 (할당된 파일만 편집)
- **tmux socket**: `~/.uniflow/sockets/` 에 전용 socket (user session과 분리)
- **Permission bypass**: `--dangerously-skip-permissions` (Claude) / `--dangerously-bypass-approvals-and-sandbox` (Codex) — 사용자가 `uniflow start` 시 암시적 동의
- **Atomic writes**: 모든 상태 파일은 tmp→rename으로 부분 읽기 방지

### Error Handling Strategy

| Error Condition | Handling | User Impact |
|---|---|---|
| Worker pane dead | daemon 이벤트 로그 + orchestrator에 위임 | orchestrator가 respawn 판단 |
| Orchestrator pane dead | daemon 자동 respawn + recovery inbox | 세션 자동 복구 |
| Daemon crash | tmux panes 생존 | `uniflow start` 재접속 |
| Inbox write fail | retry 1회 → 이벤트 로그 + CLI 에러 반환 | orchestrator에게 에러 표시 |
| send-keys 전달 실패 | capture-pane 확인 → 재시도 1회 | 최대 1회 재시도 후 에러 |
| Worker idle > 3 nudges | 이벤트 로그 + orchestrator 알림 | orchestrator가 수동 개입 |

### Scalability Assumptions

- 동시 worker 수: 최대 5개 (기본 2개)
- tmux pane 수: 최대 8개 (TUI + orchestrator + 5 workers + 여유 1)
- outbox.jsonl 크기: 세션당 수천 줄 (무제한, 세션 종료 시 아카이브)
- 세션 동시 실행: 프로젝트당 1개

## 4. Detailed Acceptance Criteria

### Per-Component Specifications

**Daemon:**
- Input: CLI commands via Unix socket, filesystem events
- Output: tmux commands, state file writes, socket responses
- `uniflow start` 후 5초 이내 orchestrator pane ready 상태 도달
- Health check loop가 dead pane을 5초 이내 감지

**Orchestrator Agent:**
- Input: 사용자 프롬프트 (직접 대화), `uniflow status` 결과
- Output: `uniflow` CLI 명령 호출 (Bash tool)
- `uniflow spawn` 호출 후 `uniflow status --json`으로 시작 확인
- Task 할당 시 inbox 파일 + trigger 전송 완료 확인

**Worker Agent:**
- Input: inbox.md (task 지시), send-keys trigger (알림)
- Output: outbox.jsonl (결과), agents/{name}.json (상태)
- Task 완료 후 idle 상태로 전환 (daemon이 nudge/interrupt로 다음 task 전달)
- Blocked 시 status.json에 reason 기록

### Edge Cases and Error Scenarios

| Scenario | Input | Expected Behavior |
|---|---|---|
| Worker crash mid-task | pane_dead=1 | daemon 이벤트 로그, task status 유지 (in_progress) |
| Orchestrator crash | pane_dead=1 | daemon 자동 respawn, recovery inbox 전송 |
| Inbox write + crash before trigger | inbox.md 존재, trigger 미전송 | 30초 후 nudge로 복구 |
| 2 workers claim same file | worker-1 blocked | orchestrator가 worktree 생성으로 해결 |
| Codex Enter-stuck after Escape | Escape 전송 후 C-m 무반응 | C-u (line clear) 전송 후 재시도 |
| .uniflow-id 미존재 + start | 최초 실행 | 자동 생성 (random name), commit은 사용자 결정 |
| daemon socket 이미 존재 | 중복 start | 기존 세션에 접속 시도, 실패 시 에러 |

### Success / Failure Conditions

**Success:**
- `uniflow start` → orchestrator와 대화 가능
- orchestrator가 `uniflow spawn/assign/status` 명령 정상 실행
- worker가 inbox 읽고 task 수행 후 outbox에 결과 기록
- `uniflow stop` → 모든 pane 종료, session 아카이브

**Failure:**
- tmux 미설치 → exit code 4
- 세션 이미 실행 중 → exit code 2
- agent spawn 후 30초 내 ready 안 됨 → timeout 에러

## 5. Risks & No-gos

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CLI TUI 업데이트로 interrupt key 동작 변경 | Medium | High | 통합 테스트 + capture-pane 기반 동적 감지 |
| Orchestrator instruction 토큰 비용 | Medium | Medium | 명령 리스트만 제공, `--help`로 상세 위임 |
| Codex Enter-stuck 버그 지속 | Medium | Low | C-u fallback 구현 완료 |

**tmux 최소 요구 버전: 3.3+** (paste-buffer `-p` 옵션 필요). 구버전 미지원.

### Rabbit Holes to Avoid

- **MCP server 통합**: 매력적이지만 Codex MCP 지원이 미성숙. v2로 확실히 미룰 것
- **Hook 기반 trigger**: Claude Code에서는 가능하지만 Codex에서 불가. 일관성을 위해 send-keys 통일
- **Worker-to-worker 직접 통신**: 분산 합의 문제 유발. Star topology (orchestrator 경유) 유지
- **Git worktree 자동 관리**: 복잡성 높음. Orchestrator가 필요 시 명시적으로 `uniflow worktree create` 호출
- **Gemini CLI 지원**: v2로 미룸 (OMX에서 이미 지원하므로 패턴은 존재)

### Explicit Scope Boundaries

- Out of scope: MCP server 모드
- Out of scope: Gemini CLI 지원
- Out of scope: 원격 agent (다른 머신의 tmux)
- Out of scope: Web UI (TUI만)
- Out of scope: 다중 프로젝트 동시 세션

## 6. Decision Registry

| ID | Decision | Source | Status |
|----|----------|--------|--------|
| D1 | TypeScript / Bun runtime | Brainstorm: Round 1 user choice | accepted |
| D2 | Agent-in-pane orchestrator (interactive) | Brainstorm: Round 1 → Round 5 correction | accepted |
| D3 | Both interactive + non-interactive worker modes | Brainstorm: Round 1 user choice | accepted |
| D4 | ~/.uniflow/{project-id}/ global state directory | Brainstorm: Round 1 user choice | accepted |
| D5 | .uniflow-id committed file for project identity | Brainstorm: Round 2 consensus | accepted |
| D6 | outbox.jsonl (append-only, cursor) instead of Maildir | Brainstorm: Round 2 team consensus | accepted |
| D7 | send-keys primary trigger (not hooks) — Codex lacks hook support | Brainstorm: Round 2 user choice | accepted |
| D8 | Coexist with workflow-adapter (different layers) | Brainstorm: Round 1 user choice | accepted |
| D9 | Full spec scope (no reduction) | Brainstorm: Round 1 user choice | accepted |
| D10 | daemon=infra, orchestrator agent=brain boundary | Brainstorm: Round 4 user choice | accepted |
| D11 | Configurable orchestrator CLI (claude/codex) | Brainstorm: Round 4 user choice | accepted |
| D12 | Push-only task model (daemon dispatches) | Brainstorm: Round 4 team consensus (OMX precedent) | accepted |
| D13 | Orchestrator uses `uniflow` CLI via Bash for worker control | Brainstorm: Round 6 user choice | accepted |
| D14 | Daemon auto-respawns crashed orchestrator | Brainstorm: Round 6 user choice | accepted |
| D15 | bun install -g / bun link distribution | Brainstorm: Round 6 user choice | accepted |
| D16 | setup→install rename, start has no task param, init auto-runs | Brainstorm: Round 5 user correction | accepted |
| D17 | Interrupt + nudge delivery only (self-loop 폐기, daemon이 항상 주도) | Spec revision: user choice | accepted |
| D18 | paste-buffer over send-keys -l (Claude Code Esc,Esc bug) | Spec: §2 Interface Contracts | accepted |
| D19 | CLI-specific interrupt keys: C-c (Claude), Escape (Codex) | Spec: §2 Interface Contracts | accepted |
| D20 | Unix domain socket for daemon IPC | Spec: §2 Interface Contracts | accepted |
| D21 | Max 5 workers per session | Spec: §3 Scalability | accepted |
| D22 | Ink v6 + React 19 for TUI | Spec: §1 Technology Choices | accepted |
| D23 | tmux >= 3.3 필수, 구버전 미지원 | Spec revision: user choice | accepted |
| D24 | Orchestrator instruction 최소화 — 명령 리스트 + `--help` 위임 | Spec revision: user choice | accepted |
