# 목표
- 정의된 agents들을 claude agents team(aka teammate) 기능을 spawn하여 지정된 workflow로 사용자가 요구하는 문제를 해결하는 플러그인

# basePath
- {project}/.workflow-adpater/

# agents
- 기본적으로 모든 도구 사용 가능, 모든 스킬 사용 가능
- **아주 중요** `{basePath}/principle.md`가 존재한다면 이것을 항상 준수해야함
- **아주 중요** `{basePath}/principle.{agent_name}.md`가 존재한다면 이것을 항상 준수해야함, `{basePath}/principle.md`와 충돌한다면 이것을 더 우선시 해야함

## Historian
- subject를 진행하기 위해서 과거 컨텍스트를 탐색하는 에이전트
- project의 CLAUDE.md와 CLAUDE.local.md, AGENTS.md를 확인
- project의 git 기록, glab으로 연관된 history 파악
- 유저에게 context를 retrieve 할 수 있는 방법을 leader에게 요청하여 받음 

## Reasearcher
- 사용자가 요구한 사항에 대해 리서치를 수행하는 에이전트
- 기본적 로컬 탐색 외에, 웹검색, context7를 사용할 수 있음
- 자신이 리서치한 결과를 `{basePath}/{subject}/doc/` 아래에 저장
- 요구사항을 명확히 해야하거나 유저의 결정이 필요한 경우 team leader에게 메세지를 보내서 leader가 askUserQuestion으로 응답을 받기를 요청함

## Executer
- 실제 작업을 하는 에이전트
- 작업르 완수하기 위해 모든 도구를 사용할 수 있음
- 모든 에이전트는 `{basePath}/{subject}/plan.md`를 보고 자신에게 할당된 작업을 수행해야함
- 수행 내역은 항상 `{basePath}/subject}/plan.md`에 업데이트 해야함
- 병렬로 작업을 하면 동시성 문제를 위해 메세지 기능을 적극 활용해야함

## Reviewer
- 모든 워크플로우들을 검토하는 에이전트
- 정합성 뿐만 아니라 Devil's Advocate 로서 모든 것에대해 의심하고 질문을 던져야함
- 메세지 기능을 적극적으로 활용해야함
- 문제가 발견된 경우 team leader 혹은 orchestrator에게 즉시 보고해야함
- **중요** plan.md의 완수 조건이 명확하지 않은 경우엔 무조건 명확히 해야함

## Orchestrator
- team leader로서 모든 작업을 조율하는 에이전트
- subagent로 실행되지 않고 메인 에이전트로 실행됨
- teammate를 spawn하여 문제를 적극적으로 해결해야함
    - executer를 여러개 spawn 하는 경우 alpha, beta, gamma 등의 이름 순서로 스폰해야함
- plan.md의 작업을 모두 완수한 경우 "ALL JOB COMPLETE"라고 출력함.


# Skills(Commands)

## brainstorming
- 특정 작업 대해서 브레인스토밍이 필요할때 사용하는 스킬
- 특정 작업을 3-word로 요약한 것이 `subject`임. `{basePath}/{subject}` 폴더를 생성함
- historian과 reasearcher를 spawn하여 필요한 정보를 지속적으로 수집함
- AskUserQuestion을 통해 유저가 원하는 작업의 구체적인 방향을 명확히함
- reviewer teammate를 spawn하여 브레인 스토밍 작업을 검토하고 피드백하게 함
- spawn한 teammate는 모든 과정이 끝나기 전까진 종료하지 않음. 유저와 상호작용하면서 얻은 정보들을 바탕으로 추가 리서치를 진행해야함
- 모든 결과를 명확히 `{basePath}/{subject}/brainstorming.md`에 저장함

## plan
- `{basePath}/{subject}/brainstorming.md`를 기반으로 `{basePath}/{subject}/plan.md` 를 생성하는 스킬
- plan.md에는 작업 목록이 나열되어야 한다
- 유저가 worktree를 활용해달라고 하면, worktree를 사용하여 격리된 상태로 작업하는 것을 가정하고 계획을 세워야한다
- 작업을 수행하는 executer는 병렬적으로 실행이 되므로, 총 몇개의 executer가 필요한지 명시해야한다
  - `{basePath}/{subject}/worker.md`에 명시한다.
- 작업 목록은 진행상태, 변경사항을 적을 수 있는 형태여야한다
- **중요** 작업 목록의 검증 방법에 대한 내용이 꼭 있어야한다.

## execute
- command로 실행할 수 있다.
- orchestrator agent로서 실행되어야한다(fork: true 로 가능한지 확인 필요)
- worker.md를 보고 executer들을 spawn한다.



