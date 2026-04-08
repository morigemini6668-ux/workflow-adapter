---
name: ask-codex
description: "This skill should be used when the user asks to \"ask codex\", \"ask OpenAI Codex\", \"send to codex\", \"get codex's opinion\", \"codex help\", \"codex chat\", \"codex한테 물어봐\", \"codex에게 질문\", \"codex에게 질문해\", \"codex 의견\", \"codex 의견 들어봐\", \"코덱스한테 물어봐\", \"코덱스에게 질문\", or wants to send a message to the OpenAI Codex CLI running locally."
---

# Ask Codex

OpenAI Codex CLI에 프롬프트를 전송하고 응답을 반환한다.

## Prerequisites

- Codex CLI 설치 필요 (`codex` 또는 `$CODEX_CLI_PATH`)
- OpenAI 인증 완료 필요 (`codex login`)

## Workflow

1. 사용자의 메시지를 아래 명령으로 Codex에게 전달한다:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --prompt "사용자 메시지"
   ```
   JSONL 모드로 `codex exec`를 실행하고 agent_message를 수집한다.
2. 스크립트 출력(Codex의 응답)을 사용자에게 그대로 보여준다.
3. 에러 발생 시 `references/troubleshooting.md` 참조.

## Usage Variants

```bash
# 기본 (JSONL 스트리밍 모드)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --prompt "메시지"

# 파일에서 프롬프트 읽기 (긴 프롬프트)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --prompt-file path/to/prompt.txt

# CLI 모드 (codex exec -o 직접 실행)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --cli --prompt "메시지"

# 모델 지정 (별칭: spark → gpt-5.3-codex-spark)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --model o3 --prompt "메시지"
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --model spark --prompt "메시지"

# 추론 노력 수준 (none/minimal/low/medium/high/xhigh)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --effort high --prompt "메시지"

# 쓰기 가능 모드 (파일 수정 허용)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --writable --prompt "메시지"

# 타임아웃 지정 (기본: 3600초)
bun "${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts" --timeout 300 --prompt "메시지"
```

## Codex 프롬프트 작성 팁

Codex(GPT-5.4)에 효과적으로 프롬프트를 작성하려면 XML 태그를 사용한 블록 구조가 좋다:

```xml
<task>구체적인 작업 내용과 맥락</task>
<verification_loop>완료 검증 방법</verification_loop>
<grounding_rules>근거 없는 추측 금지, 관찰된 사실에 기반할 것</grounding_rules>
```

- 하나의 Codex 실행에 하나의 명확한 작업을 할당한다.
- "완료" 상태가 무엇인지 명시적으로 정의한다.
- 디버깅/구현 작업에는 검증 루프를 추가한다.
- 리뷰/리서치 작업에는 근거 규칙을 추가한다.
