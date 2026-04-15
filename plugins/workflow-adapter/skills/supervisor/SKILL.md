---
name: supervisor
description: |
  Dispatches user requests to an autonomous Claude Code process in a tmux pane.
  Analyzes the request, discovers available skills/agents, selects the optimal
  approach, generates an enriched prompt, and launches it. The supervisor's job
  ends after dispatch — no monitoring or phase control.
  Use when the user says "supervisor", "감독자", "대신 실행해줘",
  "다른 pane에서 돌려", "tmux로 실행", "자동으로 처리해줘",
  "dispatch", or wants to delegate a task to a separate autonomous Claude instance.
argument-hint: "<task description>"
disable-model-invocation: true
allowed-tools:
  - Bash
---

# Supervisor: Smart Dispatcher

유저 요청 분석 → 도구 탐색 → 도구 선택 → enriched 프롬프트 생성 → tmux pane 실행.

## Prerequisites

bun과 tmux 확인. 둘 다 통과해야 진행한다.

```bash
CLI="${CLAUDE_PLUGIN_ROOT}/scripts/supervisor/src/cli.ts"
[ -f "$CLI" ] && bun "$CLI" help >/dev/null 2>&1 && echo "READY: bun $CLI" || echo "NOT_FOUND"
```

```bash
tmux display-message -p '#{session_name}' 2>/dev/null || echo "NOT_IN_TMUX"
```

- `NOT_FOUND` → `cd ${CLAUDE_PLUGIN_ROOT}/scripts/supervisor && bun install` 실행
- `NOT_IN_TMUX` → 사용자에게 알리고 중단

이후 모든 pane 제어는 `bun $CLI <command>` 형태로 실행한다.

## Step 1: 요청 분석

`$ARGUMENTS`에서 파악:
- **목표**: 유저가 달성하려는 것
- **범위**: 파일, 모듈, 프로젝트 전체
- **제약/선호**: 특정 기술, 접근법, 조건

## Step 2: 도구 탐색

현재 컨텍스트의 system-reminder에 사용 가능한 모든 스킬 목록이 이미 로드되어 있다.
별도 파일 스캔 없이, 로드된 스킬 목록에서 유저 요청과 관련된 스킬을 식별한다.

## Step 3: 도구 선택

Step 1의 분석과 Step 2에서 식별한 스킬을 대조하여 사용할 스킬을 확정한다.
확정한 스킬은 Step 4에서 프롬프트의 `## Skills to Use` 섹션에 호출 명령과 함께 명시한다.
workflow-adapter 스킬뿐 아니라 다른 플러그인의 스킬도 적합하면 선택한다.

판단 기준:
- 특정 스킬과 직접 매칭 → 해당 스킬 호출 (`/brainstorming`, `/plan` 등)
- 복합 다단계 작업 → 워크플로우 스킬 조합 (실행 순서 포함)
- 단순 일회성 작업 → 스킬 없이 직접 수행
- 조사/디버깅 → `investigate` 또는 `ralph-debug`

## Step 4: Enriched 프롬프트 생성

현재 컨텍스트를 수집:
```bash
echo "CWD: $(pwd)" && echo "BRANCH: $(git branch --show-current 2>/dev/null || echo 'N/A')"
```

수집한 정보를 바탕으로 자립적 프롬프트를 조합한다. 실행 대상 프로세스가
별도 컨텍스트 없이 즉시 작업을 시작할 수 있어야 한다.

프롬프트에는 반드시 Step 3에서 선별한 스킬/에이전트를 **구체적으로 명시**하고,
그것을 사용하라는 지시를 포함해야 한다. 스킬을 선별했으면 호출 명령까지 적어준다.

프롬프트 구조:

```
You are an autonomous agent. Complete the task without asking questions — make all decisions yourself.

## Task
{유저 요청을 구체적으로 재구성한 설명}

## Skills to Use
너의 available skills 목록을 확인하고, 다음 스킬을 순서대로 실행하라:
1. {plugin-name}:{skill-name} {arguments}
   - 목적: {이 스킬로 달성할 것}
2. {plugin-name}:{skill-name} {arguments}  (필요시)
   - 목적: {이 스킬로 달성할 것}

스킬이 불필요한 단순 작업이면 이 섹션 대신 직접 수행 지시를 적는다.

## Context
- Working directory: {cwd}
- Branch: {branch}
{관련 파일, 기존 상태 등 추가 컨텍스트}

Start immediately.
```

## Step 5: tmux Pane에서 실행

Pane 생성 → ready 대기 → 프롬프트 주입.

```bash
CWD="$(pwd)"
PANE_ID=$(bun $CLI launch "$CWD" "claude --dangerously-skip-permissions")
echo "PANE_ID=$PANE_ID"
```

```bash
bun $CLI wait-ready $PANE_ID 120
```

- `STATUS:timeout` → capture로 상태 확인 후 재시도
- `STATUS:dead` → 에러 보고 후 중단

프롬프트 주입:
```bash
bun $CLI send-submit $PANE_ID "<enriched prompt>"
```

## 완료 보고

유저에게 다음을 알린다:
- dispatch된 작업 요약
- 선택된 도구/스킬
- pane ID (직접 확인: `tmux select-pane -t $PANE_ID`)

**supervisor의 역할은 여기서 끝.** 이후 모니터링이나 결과 확인은 하지 않는다.
