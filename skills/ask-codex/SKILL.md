---
name: Ask Codex
description: >-
  This skill should be used when the user asks to "codex에게 물어봐", "codex한테 질문해봐",
  "codex 의견 들어봐", "codex에게 리뷰해달라고 해", "ask codex", "ask codex about this",
  "get codex opinion", "check with codex", "consult codex", "what does codex think",
  "run this by codex", "codex에게 보여줘", or wants to delegate a question, review,
  or consultation to Cursor's agent CLI (codex model) about code, architecture, or any topic.
---

# Ask Codex

Delegate a question or review request to Cursor's agent CLI (`agent -p --approve-mcps`) configured with a codex model. Gather relevant context from the current conversation and codebase, construct a focused prompt, execute via CLI, and present the response.

## Core Concept

```
User Request ──> Gather Context ──> Build Prompt ──> agent -p ──> Present Response
                 (files, docs,      (context +        (stdout)
                  conversation)      question)
```

## Workflow

### 1. Parse User Intent

Extract from the user's message:
- **Question**: What to ask codex (may be explicit or implied from conversation context)
- **Target files**: Any specific files or code the user wants codex to review
- **Scope**: Whether this is about a specific file, a feature, the whole project, or a general question

If the user's intent is unclear, ask for clarification using AskUserQuestion:

```yaml
question: "codex에게 무엇을 물어볼까요?"
header: "Question"
options:
  - label: "현재 작업 리뷰"
    description: "지금 작업 중인 코드/파일에 대한 리뷰 요청"
  - label: "아키텍처 의견"
    description: "프로젝트 구조나 설계에 대한 의견 요청"
  - label: "직접 질문 작성"
    description: "codex에게 보낼 질문을 직접 입력"
multiSelect: false
```

### 2. Gather Context

Based on the parsed intent, collect relevant context. Minimize context to only what is necessary for the question.

**Context sources (select relevant ones):**

| Source | When to Include |
|--------|----------------|
| Specific files | User mentions a file or code block |
| Feature documents | Current session involves a feature workflow (check `.workflow-adapter/doc/feature_*/`) |
| Git diff | User asks about recent changes |
| Error output | User asks about an error or issue |
| Conversation summary | User asks a general question about current discussion |

**For feature workflow context**, check for these files in `.workflow-adapter/doc/feature_{name}/`:
- `context.md` - Research context
- `brainstorming.md` - Brainstorming results
- `spec.md` - Feature specification
- `plan.md` - Implementation plan

Read only the documents relevant to the question. Summarize large documents rather than including them verbatim.

### 3. Build Prompt

Construct a focused prompt combining the context and question:

```
## Context

{gathered context - files, docs, conversation summary}

## Question

{the specific question or request for codex}
```

**Prompt guidelines:**
- Keep total prompt under 8,000 characters to avoid CLI issues
- Summarize large files rather than including full content
- Include file paths and line numbers when referencing code
- Frame the question clearly and specifically
- Write the prompt in the same language the user is using

### 4. Execute Agent CLI

Run the agent command via Bash with a 120-second timeout:

```bash
agent -p --approve-mcps "{prompt}"
```

Note: `--approve-mcps` is required to auto-approve MCP servers in headless/print mode.

**Additional options:**
- `--workspace {path}`: Set workspace if the question is about a specific project directory
- `--model {model}`: Override model if user requests a specific one (default uses configured codex model)

If the prompt is too long for a single command argument, write it to a temporary file and pipe it:

```bash
cat /tmp/codex-prompt.txt | xargs -0 agent -p --approve-mcps
```

Clean up the temporary file after the command completes.

**Error handling:**
- If `agent` command is not found, inform the user to install Cursor CLI
- If authentication fails, suggest running `agent login`
- If the command times out, suggest simplifying the question or reducing context

### 5. Present Response

Display codex's response with clear attribution:

```markdown
**Codex Response:**

{response from agent CLI}
```

After presenting, ask if follow-up is needed:

```yaml
question: "codex 응답에 대해 추가 작업이 필요한가요?"
header: "Follow-up"
options:
  - label: "충분해요"
    description: "추가 작업 없이 종료"
  - label: "추가 질문"
    description: "codex에게 후속 질문 전달"
  - label: "반영하기"
    description: "codex 의견을 현재 작업에 반영"
multiSelect: false
```

If the user wants a follow-up question, repeat from step 3 with the previous response included as additional context.

## Constraints

- Write prompts in the same language the conversation is conducted in
- Keep prompts concise and focused - avoid dumping entire files when a summary suffices
- Set Bash timeout to 120000ms for agent CLI execution
- Do not expose API keys or sensitive information in prompts
- If codex suggests code changes, present them as suggestions - do not auto-apply without user confirmation
- Clearly attribute all responses as coming from codex to avoid confusion
