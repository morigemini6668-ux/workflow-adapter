---
description: Review fix documents using reviewer agent
argument-hint: <name>
allowed-tools: [Read, Task]
---

Review all fix documents using the reviewer agent as a subagent.

## Arguments
- `$1`: Fix name (required)

## Tasks to Perform

### 1. Validate Prerequisites and Check Versions

**Step 1.1: Check prerequisites exist**
Check that these files exist:
- `.workflow-adapter/doc/fix_$1/context.md` (project context)
- `.workflow-adapter/doc/fix_$1/triage.md` (triage report)
- `.workflow-adapter/doc/fix_$1/plan.md` (implementation plan)

If any are missing, inform user which steps to run first.

**Step 1.2: Check version dependencies**

If `.workflow-adapter/doc/fix_$1/review.md` already exists:

1. Read review.md and extract YAML frontmatter `depends_on` section
2. For each dependency (context.md, triage.md, plan.md):
   - Read the dependency file's frontmatter `version` field
   - Compare with the version recorded in review.md's `depends_on`

3. If any dependency's current version differs from recorded version (or if review.md has no frontmatter/depends_on):

   Show warning to user:
   ```
   ⚠️ review.md was generated based on older versions of prerequisites.

   Version changes detected:
   - {filename}: recorded {old_version} → current {new_version}
   ```

   Use AskUserQuestion to let user decide:
   ```yaml
   question: "review.md의 선행 문서가 업데이트되었습니다. 어떻게 진행할까요?"
   header: "버전 충돌"
   options:
     - label: "재생성 (권장)"
       description: "최신 선행 문서 기반으로 review.md 새로 생성"
     - label: "기존 유지"
       description: "현재 review.md 유지 (선행 문서와 불일치할 수 있음)"
     - label: "취소"
       description: "작업 중단"
   ```

   - If "재생성": Continue with review generation (Step 2)
   - If "기존 유지": Skip review generation, proceed to summary
   - If "취소": Stop execution

4. If review.md doesn't exist OR user chose "재생성":
   Proceed to Step 2 (Gather Fix Documents)

### 2. Gather Fix Documents
Read all fix documents:
- Context: @.workflow-adapter/doc/fix_$1/context.md
- Triage: @.workflow-adapter/doc/fix_$1/triage.md
- Plan: @.workflow-adapter/doc/fix_$1/plan.md

### 3. Launch Reviewer Agent
Use the Task tool to launch the reviewer as a subagent with this prompt:

```
You are the Reviewer agent. Review the following fix documents for completeness and quality.

Fix: {fix_name}

## Documents to Review

### Project Context
{context content - existing fixes, project docs}

### Triage Report
{triage content - problem, root cause, solutions, risks}

### Implementation Plan
{plan content - tasks, assignments, guidance}

## Review Criteria

1. **Root Cause Validation**
   - Is the identified root cause accurate and well-supported?
   - Is there sufficient evidence (code references, logs)?
   - Could there be other contributing factors?

2. **Solution Appropriateness**
   - Does the chosen solution address the root cause?
   - Are alternative solutions properly evaluated?
   - Is the solution proportionate to the problem?

3. **Risk Assessment**
   - Are all risks identified in triage addressed in plan?
   - Are mitigation strategies adequate?
   - Is the rollback plan realistic?

4. **Implementation Plan Quality**
   - Are tasks correctly derived from triage findings?
   - Are dependencies properly identified?
   - Is the testing strategy sufficient?
   - Are agent assignments balanced and logical?

5. **Completeness**
   - Is the impact scope fully covered?
   - Are all affected files addressed in tasks?
   - Are documentation updates included if needed?

## Output Required
Provide a structured review with:
- Overall assessment (APPROVED / NEEDS_REVISION)
- Issues found (by category: Critical/Major/Minor)
- Specific recommendations
- Questions for the user
```

### 4. Save Review Results
Write the review feedback to `.workflow-adapter/doc/fix_$1/review.md`:

```markdown
---
version: "{CURRENT_TIMESTAMP_ISO8601}"
depends_on:
  context.md: "{VERSION_FROM_CONTEXT_MD}"
  triage.md: "{VERSION_FROM_TRIAGE_MD}"
  plan.md: "{VERSION_FROM_PLAN_MD}"
---

# Fix Review Feedback: {fix_name}

## Review Date
{timestamp}

## Status
{APPROVED / NEEDS_REVISION}

## Fix Summary
- **Issue Type**: {from triage}
- **Severity**: {from triage}
- **Root Cause**: {brief summary}
- **Chosen Solution**: {brief summary}

## Issues Found

### Critical
{Issues that must be fixed before proceeding}

### Major
{Issues that should be addressed}

### Minor
{Suggestions for improvement}

## Root Cause Assessment
{Reviewer's evaluation of the root cause analysis}

## Solution Assessment
{Reviewer's evaluation of the chosen solution}

## Risk Concerns
{Any additional risks identified}

## Recommendations
{specific recommendations for improvement}

## Questions
{any questions for clarification}

---
_Reviewed by: reviewer agent_
```

### 5. Process Review Results
Based on reviewer feedback:
- If APPROVED: Inform user they can proceed to execution
- If NEEDS_REVISION: List specific issues and inform about `--revise` option

### 6. Output Summary
```
Fix Review: {fix_name}

Status: {APPROVED / NEEDS_REVISION}

Review saved to: .workflow-adapter/doc/fix_{name}/review.md

{If NEEDS_REVISION}
Issues to Address:
1. {issue 1}
2. {issue 2}

Next steps:
- Review feedback: cat .workflow-adapter/doc/fix_{name}/review.md
- Revise triage: /workflow-adapter:fix-triage {name} (if root cause needs revision)
- Revise plan: /workflow-adapter:fix-plan {name} --revise

{If APPROVED}
All documents pass review.

Next step: /workflow-adapter:execute {name} --fix
```
