---
description: Review fix documents using reviewer agent
argument-hint: <name>
allowed-tools: [Read, Task]
---

Review all fix documents using the reviewer agent as a subagent.

## Arguments
- `$1`: Fix name (required)

## Tasks to Perform

### 1. Validate Prerequisites
Check that these files exist:
- `.workflow-adapter/doc/fix_$1/context.md` (project context)
- `.workflow-adapter/doc/fix_$1/triage.md` (triage report)
- `.workflow-adapter/doc/fix_$1/plan.md` (implementation plan)

If any are missing, inform user which steps to run first.

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
