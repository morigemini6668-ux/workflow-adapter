---
name: tdd
description: |
  Test-Driven Development 워크플로우. 기능 구현 요청을 TDD 사이클
  (테스트 목록 → 리뷰 → per-test RED→GREEN 루프 → Refactor)로 수행한다.
  Use this skill when the user says "TDD", "TDD로 해", "테스트 먼저 작성",
  "test first", "red-green", "테스트 주도 개발", "test driven", "테스트부터",
  "write tests first", "TDD 방식으로", "TDD로 구현", or mentions TDD methodology
  in the context of implementing a feature. Also trigger when the user explicitly
  asks to follow test-driven development for any implementation task, even if they
  just say "TDD" with no other context. Do NOT trigger for general testing requests
  without TDD intent — use qa or qa-report for those.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
argument-hint: "<구현할 기능 설명> [--reviewer codex|copilot] [--skip-refactor]"
---

# /tdd: Test-Driven Development

TDD는 "테스트를 먼저 작성하고, 실패를 확인한 뒤, 통과시키는 코드를 작성하는" 개발 방법론이다.
이 스킬은 그 흐름을 구조화하고, 각 단계의 게이트를 통과해야만 다음으로 진행한다.

```
Phase 0: 환경 탐색 + baseline
Phase 1: 요구사항 확인 + 테스트 목록 생성
Phase 2: 테스트 목록 리뷰
Phase 3: Per-test TDD 사이클 (테스트마다 반복)
   ┌→ 테스트 작성 → RED 🔴 확인 → 타당성 점검 → 구현 → GREEN 🟢 확인 ─┐
   └──────────────── 다음 테스트 ←──────────────────────────────────────┘
Phase 4: 최종 GREEN 확인
Phase 5: 리팩토링
```

## 옵션 파싱

유저의 입력에서 아래 옵션을 파싱한다:

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--reviewer <who>` | `user` | 리뷰어 지정: `codex`, `copilot`. 기본 동작은 Phase별로 다름 — 아래 참조 |
| `--skip-refactor` | false | Phase 5 리팩토링 단계 생략 |

**구현 대상이 없는 경우**: 유저가 "TDD" 또는 "TDD로 해"만 입력하고 구현 대상을 명시하지 않았으면, AskUserQuestion으로 무엇을 구현할지 먼저 물어본다.

**`--reviewer` Phase별 기본 동작:**
- **Phase 2 (테스트 목록 리뷰)**: 기본값(`user`)일 때 유저에게 명시적 승인을 요청한다. 테스트 목록은 이후 전체 TDD의 방향을 결정하므로 사람의 확인이 필요하다.
- **Phase 3b (RED 타당성 점검)**: 기본값(`user`)일 때 Claude가 자체 점검하고, 의심스러운 항목만 유저에게 확인한다. 매 테스트마다 유저 승인을 받으면 per-test 루프의 템포가 깨지기 때문이다.
- `codex`/`copilot` 지정 시에는 두 Phase 모두 해당 리뷰어에게 요청한다.

---

## Phase 0: 환경 탐색 + Baseline

TDD를 시작하기 전에 프로젝트의 테스트 환경을 파악하고, 현재 상태를 기록한다.

### 0-1. 테스트 환경 탐지

1. **테스트 프레임워크** — `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile` 등에서 테스트 러너 확인
2. **기존 테스트 패턴** — 디렉토리 구조, 파일 네이밍(`*.test.ts`, `*_test.go`, `test_*.py` 등), 헬퍼/픽스처
3. **테스트 실행 커맨드** — `npm test`, `pytest`, `go test ./...`, `cargo test` 등

기존 프로젝트의 패턴을 그대로 따른다. 테스트 환경이 없으면 유저에게 선호하는 프레임워크를 물어보고, 유저가 위임하면 언어 생태계의 표준 도구를 선택한다 (예: TypeScript → vitest, Python → pytest, Go → go test).

### 0-2. Baseline 기록

기존 테스트가 있으면 전체 테스트를 실행하고 현재 상태를 기록한다:
- 총 테스트 수, PASS 수, FAIL 수
- 이미 실패 중인 테스트 목록과 **실패 시그니처** (에러 타입, 에러 메시지 요약)

실패 시그니처까지 기록하는 이유: 이후 Phase 3c/4/5에서 "baseline 상 이미 실패 중이던 테스트는 상태 변화 없으면 허용"이라는 게이트를 사용하는데, 테스트 이름만으로는 "같은 테스트가 같은 이유로 실패하는지" 판별할 수 없다. 에러 시그니처가 바뀌었으면 새로운 regression으로 취급한다.

### 0-3. 테스트 범위 정의

이 스킬에서 "테스트 실행"이라 하면:
- **관련 테스트**: 현재 작업 중인 모듈/패키지의 테스트 + 변경된 인터페이스를 import하는 다른 모듈의 테스트 (Phase 3 루프 중 사용)
- **전체 테스트**: repo의 전체 테스트 스위트 실행 (Phase 4 최종 확인, Phase 5 리팩토링 후 사용)

### 0-4. 테스트 레벨

기본적으로 **unit test**를 작성한다. 외부 의존성(DB, API, 파일시스템 등)이 필요한 행위는 해당 의존성을 mock/stub하여 unit 수준으로 유지한다. integration test가 필요한 경우 유저에게 먼저 확인한다.

---

## Phase 1: 요구사항 확인 + 테스트 목록 생성

### 1-1. 요구사항 확인

테스트 목록을 작성하기 전에, 유저의 요구사항이 테스트로 변환할 만큼 구체적인지 확인한다. 아래 중 하나라도 모호하면 AskUserQuestion으로 유저에게 명확하게 확인한다:
- 입력과 출력의 형태
- 에러 시 기대 행위 (예외? 기본값? 무시?)
- 기존 코드 수정인지, 새 기능 추가인지

### 1-2. 대규모 기능 분할

구현 대상이 크면 (예상 테스트 10개 이상, 또는 여러 모듈에 걸침) 먼저 독립적인 vertical slice로 분할하고, slice 단위로 Phase 1~5를 반복한다. 한 번에 모든 것을 TDD하려 하면 big-bang 구현으로 흐르기 쉽다.

**Slice 반복 시 규칙:**
- 이전 slice에서 작성한 테스트와 구현은 다음 slice의 baseline에 포함된다 (기존 테스트로 취급)
- 완료 보고는 전체 slice를 합산하여 한 번에 보고한다

### 1-3. 테스트 목록 작성

유저의 구현 요구사항을 분석하여 테스트 케이스 목록을 작성한다.

**작성 원칙:**
- **행위 기반** — 구현 세부사항이 아니라 외부에서 관찰 가능한 행위 단위로 나눈다
- **경계값과 예외 포함** — happy path만으로는 부족. 빈 입력, 경계값, 에러 시나리오를 반드시 포함
- **우선순위 부여** — 핵심 기능(must) → 경계값(should) → 예외(edge) 순서
- **테스트 이름은 기대 행위 서술** — `"빈 배열이 주어지면 0을 반환한다"` 처럼 명확하게

**출력 형식:**

```markdown
## 테스트 목록

### 핵심 (must)
1. 유효한 입력이 주어지면 올바른 결과를 반환한다
2. ...

### 경계값 (should)
3. 빈 입력이 주어지면 기본값을 반환한다
4. ...

### 예외 (edge)
5. 잘못된 형식이 주어지면 에러를 던진다
6. ...
```

---

## Phase 2: 테스트 목록 리뷰

### 게이트: 테스트 목록이 리뷰를 통과해야 Phase 3으로 진행한다.

### 리뷰어 결정

- **기본 (`--reviewer` 미지정)**: AskUserQuestion으로 목록을 보여주고 유저에게 승인/수정 요청
- **`--reviewer codex`**: ask-codex 스킬 호출
- **`--reviewer copilot`**: ask-copilot 스킬 호출
- **fallback**: codex/copilot 호출 실패 시 유저에게 fallback — 에러를 보여주고 유저가 직접 리뷰

### 리뷰 관점

리뷰어에게 아래 관점을 제시한다:

1. **누락**: 빠진 케이스가 없는가? (에러, 경계값, 동시성, 권한)
2. **중복**: 같은 행위를 중복 검증하는 케이스가 없는가?
3. **명확성**: 테스트 이름만으로 기대 행위가 명확한가?
4. **우선순위**: 핵심/경계/예외 분류가 적절한가?

리뷰 피드백을 반영하여 목록을 업데이트한 뒤 다음 단계로 넘어간다.

### codex/copilot 리뷰어 호출 시 프롬프트

```
아래 테스트 목록을 리뷰해줘. 구현 대상: {기능 설명}

{테스트 목록 전문}

리뷰 관점:
- 누락된 케이스 (에러, 경계값, 동시성, 권한)
- 중복 케이스
- 테스트 이름 명확성
- 우선순위 적절성

피드백을 항목별로 알려줘.
```

---

## Phase 3: Per-test TDD 사이클

테스트 목록의 각 케이스를 순서대로 하나씩 TDD 사이클로 진행한다.
핵심(must) → 경계값(should) → 예외(edge) 순서.

**각 테스트마다 아래 3a → 3b → 3c를 반복한다.**

**목록 수정**: 구현 도중 누락된 케이스나 새로운 선행 행위를 발견하면, 테스트 목록 끝에 추가한다. 현재 진행 중인 사이클을 완료한 뒤 추가된 테스트를 진행한다. 기존 테스트의 우선순위를 바꿔야 할 경우도 현재 사이클 완료 후 조정한다.

### 3a. 테스트 작성 + RED 확인 🔴

1. **테스트 코드 작성** — 목록에서 다음 테스트 1개를 실제 테스트 코드로 작성
   - 각 테스트는 **하나의 행위만 검증**
   - **Greenfield** (새 기능): 필요한 함수/클래스의 인터페이스만 선언 (빈 구현, stub)
   - **Brownfield** (기존 코드 수정): 기존 구현이 있으므로 stub 불필요. 기대하는 새 행위를 테스트로 작성

2. **관련 테스트 실행** → 새 테스트가 FAIL하는지 확인

**RED 게이트**: 새 테스트가 FAIL이어야 한다.
- ✅ FAIL → 3b로 진행
- ❌ PASS → 원인 분석:
  - **이미 구현된 행위**: 이 테스트는 characterization test(현재 행위 기록)로 분류. 목록에서 제거하지 말고 regression 보호용으로 유지. **즉시 🟢 처리하고 다음 테스트로 진행** (3b, 3c 건너뜀). 완료 보고 시 "characterization" 별도 집계
  - **무의미한 테스트**: assertion이 항상 통과하는 구조 → assertion 수정 후 재실행

RED의 의미는 "구현이 없어서 실패"에 국한되지 않는다. **"기대 행동 ≠ 현재 행동"이면 올바른 RED다.** 기존 코드가 있지만 기대와 다르게 동작하여 실패하는 것도 정상적인 RED.

### 3b. RED 타당성 점검

새 테스트의 실패가 올바른 RED인지 점검한다.

**기본 (`--reviewer` 미지정 또는 `--reviewer user`)**: Claude가 아래 관점으로 자체 점검 후, 의심스러운 항목만 유저에게 확인한다.
**`--reviewer codex|copilot`**: 해당 리뷰어에게 실패 로그와 테스트 코드를 보내 점검 요청한다. 호출 실패 시 유저 fallback.

**점검 관점:**
1. **실패 원인이 "기대 행동 ≠ 현재 행동"인가?** — 올바른 RED
2. **테스트 자체의 버그로 실패한 건 아닌가?** — import 오류, 잘못된 assertion, setup 누락
3. **테스트가 구현 세부사항에 의존하지 않는가?** — 내부 메서드 호출 순서, private 필드 접근 등

문제가 있으면 테스트를 수정하고 3a의 RED 확인부터 다시 진행.

**codex/copilot 점검 요청 프롬프트:**

```
아래 실패한 테스트의 타당성을 점검해줘.

{테스트 코드}

실패 로그:
{실패 출력}

점검 관점:
1. 실패 원인이 "기대 행동과 현재 행동의 불일치"인가, 테스트 버그인가?
2. 구현 세부사항에 의존하는 취약한 테스트인가?
3. assertion이 기대 행위를 정확히 표현하는가?
```

### 3c. 구현 + GREEN 확인 🟢

1. **테스트를 통과시키는 최소한의 코드를 작성** — 미래를 위한 과설계 금지
2. **관련 테스트 실행** → 새 테스트 PASS + 이전에 통과한 테스트가 깨지지 않는지 확인

**GREEN 게이트**: 새 테스트 PASS + 기존 테스트 regression 없음 (baseline 상 이미 실패 중이던 테스트는 상태 변화 없으면 허용).
- ✅ PASS + no regression → 다음 테스트로 (3a로 돌아감)
- ❌ FAIL → 구현 수정. 이전 테스트가 깨졌으면 즉시 원인 분석 후 수정

### 진행 추적

테스트 하나를 GREEN으로 만들 때마다 상태를 업데이트한다:

```
### 핵심 (must)
1. 🟢 유효한 입력이 주어지면 올바른 결과를 반환한다
2. 🟢(char) 이미 구현된 행위  ← characterization test
3. 🔴 세 번째 핵심 테스트  ← 현재

### 경계값 (should)
4. ⬜ 빈 입력이 주어지면 기본값을 반환한다
```

- `🟢` — TDD 사이클(RED→GREEN)을 거쳐 통과
- `🟢(char)` — RED에서 바로 PASS하여 characterization test로 분류
- `🔴` — 현재 작업 중
- `⬜` — 미착수

---

## Phase 4: 최종 GREEN 확인

모든 테스트의 per-test 사이클이 완료되면, **전체 테스트 스위트**를 실행한다.

**게이트 조건:**
- 새로 작성한 테스트: 전부 PASS
- 기존 테스트: baseline 대비 새로운 실패 없음 (Phase 0에서 이미 실패 중이던 테스트는 제외)

결과:
- ✅ 조건 충족 → Phase 5로 진행 (또는 `--skip-refactor` 시 완료 보고)
- ❌ 미충족 → 실패 원인 분석 후 해당 테스트를 Phase 3 사이클로 다시 진행

유저에게 결과를 보여준다:

```
## 최종 GREEN 확인 🟢

✅ 새 테스트 N/N passed
✅ 기존 테스트 regression 없음 (baseline 대비)

### 핵심 (must): N/N passed
### 경계값 (should): N/N passed
### 예외 (edge): N/N passed
```

---

## Phase 5: 리팩토링

`--skip-refactor` 옵션이 있으면 이 단계를 건너뛴다.

테스트가 모두 통과한 상태에서 코드 품질을 개선한다.

### 리팩토링 대상

- 중복 코드 제거
- 명확한 네이밍으로 변경
- 함수/메서드 적절한 크기로 분리
- 불필요한 복잡도 제거
- 테스트 코드의 중복도 정리 (공통 setup 추출 등)

### 안전장치

리팩토링 후 **전체 테스트를 다시 실행**한다.

- ✅ 모두 PASS (baseline 대비 새로운 실패 없음) → 리팩토링 유지
- ❌ 새로운 FAIL → 리팩토링이 행위를 변경한 것. 해당 변경을 되돌리거나 수정

리팩토링은 행위를 바꾸지 않는다 — 테스트가 그 증거다.

---

## 완료 보고

모든 Phase를 마치면 아래 형식으로 결과를 보고한다:

```
## TDD 완료 보고

### 테스트 목록
- 핵심: N개 / 경계값: N개 / 예외: N개 / 합계: N개

### Baseline
- 시작 전 기존 테스트: N개 (PASS N / FAIL N)

### 결과
- 🟢 새 테스트 전체 N개 통과 (TDD 사이클: N개, characterization: N개)
- 기존 테스트 regression 없음
- 리팩토링: 수행됨 (또는 생략됨)

### 생성/수정된 파일
- 테스트: `path/to/test-file`
- 구현: `path/to/impl-file`
```
