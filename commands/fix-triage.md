---
description: Triage a bug or technical debt issue with root cause analysis
argument-hint: <name> [problem description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, WebSearch, WebFetch, Grep, Bash, Task, TodoWrite, Skill]
---

Triage a bug or technical debt issue through interactive analysis.

## Arguments
- `$1`: Fix name (required, no spaces, use-kebab-case)
- Remaining arguments: Initial problem description

## Tasks to Perform

### 1. Validate Arguments
Ensure fix name is provided. If not, ask the user for it.

### 2. Create Fix Directory
```bash
mkdir -p .workflow-adapter/doc/fix_$1
```

### 3. Gather Project Context
**Read project documentation:**
- Check if `AGENT.md` exists and read it
- Check if `CLAUDE.md` exists and read it
- Check if `.claude/settings.json` exists and read it

**Find existing fixes:**
- Use Glob to find: `.workflow-adapter/doc/fix_*/triage.md`
- Read each triage.md to understand previously triaged issues
- Skip the current fix directory if it already exists

**Write context summary to `.workflow-adapter/doc/fix_$1/context.md`:**

```markdown
# Fix Context: {fix_name}

## User Report
- **Fix Name**: {name}
- **Initial Problem Description**: {description from arguments}

## Project Documentation

### AGENT.md
{Content summary or "Not found"}

### CLAUDE.md
{Content summary or "Not found"}

## Previous Fixes
{For each existing fix:}
### fix_{name}
- **Issue**: {from triage overview}
- **Root Cause**: {summarized}
- **Status**: {if available}

## Context Summary
- Total previous fixes: {count}
- Potentially related fixes: {list any that seem related}

---
_Context gathered: {timestamp}_
```

**Show summary to user:**
```
Project Context Gathered

Project docs: AGENT.md {check/x}, CLAUDE.md {check/x}
Previous fixes: {count} found

Now analyzing the reported problem...
```

### 4. Interactive Problem Analysis

Use AskUserQuestion to understand the problem in depth.

**Step 4.1: Problem Clarification**

```yaml
question: "어떤 유형의 문제인가요?"
header: "문제 유형"
options:
  - label: "버그/오류"
    description: "예상치 못한 동작, 에러 발생"
  - label: "성능 문제"
    description: "느림, 메모리 사용량 높음"
  - label: "기술 부채"
    description: "리팩토링 필요, 코드 품질"
  - label: "보안 이슈"
    description: "취약점, 보안 개선"
multiSelect: true
```

**Step 4.2: Reproduction Information**

```yaml
question: "문제를 재현할 수 있나요? 재현 방법이나 에러 메시지를 알려주세요."
header: "재현 정보"
options:
  - label: "항상 재현됨"
    description: "특정 조건에서 항상 발생"
  - label: "간헐적 발생"
    description: "가끔씩 발생"
  - label: "재현 불가"
    description: "아직 재현 방법을 모름"
  - label: "에러 로그 있음"
    description: "에러 메시지/스택 트레이스 있음"
multiSelect: true
```

If user has error logs, ask them to provide via "Other".

### 5. Code Analysis

Based on user's problem description, perform systematic code analysis.

**5.1 Error Location (Use Grep + Read)**
- Search for keywords mentioned in the problem
- Find relevant files, functions, classes

```
Using Grep to search for: {keywords from problem}
```

**5.2 Root Cause Investigation (Use Task with Explore agent)**
When the codebase needs deeper exploration:

```
Launching Explore agent to:
- Trace the code flow related to the issue
- Find potential root causes
- Identify affected code paths
```

Use Task tool with subagent_type=Explore for:
- "Find where {error message} originates"
- "Trace the execution path of {function/feature}"
- "Find all code that handles {specific case}"

**5.3 Symbolic Analysis (Use Serena MCP if available)**
For deeper understanding of code structure:

```
Using symbolic analysis to:
- Find symbol definitions and references
- Understand class hierarchies
- Trace function call graphs
```

Use Serena tools when needed:
- `find_symbol`: Find specific functions/classes
- `find_referencing_symbols`: Find where code is called
- `get_symbols_overview`: Understand file structure

**5.4 Impact Assessment**
Determine what else might be affected:
- Find all callers of the problematic code
- Check for similar patterns elsewhere
- Identify integration points

### 6. Solution Brainstorming

Use AskUserQuestion to discuss potential solutions:

```yaml
question: "분석 결과를 바탕으로 다음 해결 방안들을 제안합니다:\n\n{solutions}\n\n어떤 접근 방식을 선호하시나요?"
header: "해결 방안"
options:
  - label: "방안 1 선택"
    description: "{solution 1 brief}"
  - label: "방안 2 선택"
    description: "{solution 2 brief}"
  - label: "여러 방안 조합"
    description: "복수의 방안을 함께 적용"
  - label: "다른 방안 제안"
    description: "직접 해결 방안 제안"
multiSelect: false
```

### 7. Risk Assessment

Evaluate risks associated with the fix:
- Breaking changes possibility
- Test coverage status
- Dependencies that might be affected

```yaml
question: "수정 시 주의해야 할 부분이 있나요?"
header: "위험 요소"
options:
  - label: "테스트 필요"
    description: "충분한 테스트 커버리지 필요"
  - label: "하위 호환성"
    description: "기존 동작과의 호환성 확인 필요"
  - label: "성능 영향"
    description: "성능에 미치는 영향 확인 필요"
  - label: "특별한 주의사항 없음"
    description: "일반적인 수정 절차로 충분"
multiSelect: true
```

### 8. Document Triage Results

Write to `.workflow-adapter/doc/fix_$1/triage.md`:

```markdown
# Triage Report: {fix_name}

## Overview
- **Fix Name**: {name}
- **Reported Issue**: {initial description}
- **Issue Type**: {bug/performance/tech-debt/security}
- **Severity**: {Critical/High/Medium/Low}
- **Triage Date**: {timestamp}

## Problem Description

### Symptoms
{User-reported symptoms and observations}

### Reproduction Steps
{How to reproduce, if applicable}
1. {step 1}
2. {step 2}
3. Expected: {expected behavior}
4. Actual: {actual behavior}

### Error Information
{Error messages, stack traces if available}

## Root Cause Analysis

### Investigation Summary
{Summary of code analysis performed}

### Identified Root Cause
{Detailed explanation of why the problem occurs}

### Evidence
- **File**: `{path}` (line {n})
- **Code**: {relevant code snippet}
- **Reason**: {why this causes the issue}

### Contributing Factors
- {factor 1}
- {factor 2}

## Impact Scope

### Affected Components
| Component | File(s) | Impact Level |
|-----------|---------|--------------|
| {component} | `{path}` | High/Medium/Low |

### Affected Functionality
- {functionality 1}
- {functionality 2}

### Dependencies
{External/internal dependencies that might be affected}

## Proposed Solutions

### Solution 1: {name} (Recommended)
**Description**: {detailed description}

**Changes Required**:
- `{file1}`: {what to change}
- `{file2}`: {what to change}

**Pros**:
- {advantage 1}
- {advantage 2}

**Cons**:
- {disadvantage 1}

**Estimated Effort**: {Small/Medium/Large}

### Solution 2: {name} (Alternative)
{Similar structure}

### Chosen Approach
{Which solution was selected and why}

## Risk Assessment

### Potential Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| {risk 1} | High/Medium/Low | High/Medium/Low | {mitigation strategy} |

### Testing Requirements
- [ ] Unit tests for {component}
- [ ] Integration tests for {flow}
- [ ] Manual testing for {scenario}

### Rollback Plan
{How to revert if something goes wrong}

## Recommendations

### Immediate Actions
1. {action 1}
2. {action 2}

### Follow-up Tasks
- {task that should be done later}

## Related Information

### Related Issues
- {Related fix or feature if any}

### References
- {Documentation, tickets, etc.}

---
_Triage completed: {timestamp}_
_Analyst: Claude_
```

### 9. Output Summary

```
Triage for '{fix_name}' completed:
.workflow-adapter/doc/fix_{name}/triage.md

Summary:
- Issue Type: {type}
- Severity: {severity}
- Root Cause: {brief root cause}
- Recommended Solution: {solution name}
- Affected Files: {count} files

Next step:
- Run /workflow-adapter:fix-plan {name} to create implementation plan
- Or run /workflow-adapter:fix {name} for the complete fix workflow
```
