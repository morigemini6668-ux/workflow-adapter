---
description: Review feature documents using reviewer agent
argument-hint: <name>
allowed-tools: [Read, Task]
---

Review all feature documents using the reviewer agent as a subagent.

## Arguments
- `$1`: Feature name (required)

## Tasks to Perform

### 1. Validate Prerequisites
Check that these files exist:
- `.workflow-adapter/doc/feature_$1/context.md` (project context)
- `.workflow-adapter/doc/feature_$1/brainstorming.md`
- `.workflow-adapter/doc/feature_$1/spec.md`
- `.workflow-adapter/doc/feature_$1/plan.md`

If any are missing, inform user which steps to run first.

### 2. Gather Feature Documents
Read all feature documents:
- Context: @.workflow-adapter/doc/feature_$1/context.md
- Brainstorming: @.workflow-adapter/doc/feature_$1/brainstorming.md
- Specification: @.workflow-adapter/doc/feature_$1/spec.md
- Plan: @.workflow-adapter/doc/feature_$1/plan.md

### 3. Launch Reviewer Agent
Use the Task tool to launch the reviewer as a subagent with this prompt:

```
You are the Reviewer agent. Review the following feature documents for completeness and quality.

Feature: {feature_name}

## Documents to Review

### Project Context
{context content - existing features, project docs}

### Brainstorming Document
{brainstorming content}

### Specification Document
{spec content}

### Implementation Plan
{plan content}

## Review Criteria

1. **Completeness**
   - Are all requirements from brainstorming captured in spec?
   - Are all spec requirements covered in the plan?
   - Are acceptance criteria clear and measurable?

2. **Consistency**
   - Do documents align with each other?
   - Are there any contradictions?
   - Is terminology consistent?

3. **Context Alignment**
   - Does the feature properly integrate with existing features? (from context.md)
   - Are project conventions followed? (from AGENT.md/CLAUDE.md in context)
   - Are potential conflicts with existing features addressed?

4. **Feasibility**
   - Is the plan realistic?
   - Are task assignments balanced?
   - Are dependencies properly identified?

5. **Quality**
   - Is the specification detailed enough?
   - Are edge cases covered?
   - Are risks identified?

## Output Required
Provide a structured review with:
- Overall assessment (APPROVED / NEEDS_REVISION)
- Issues found (by category)
- Specific recommendations
- Questions for the user
```

### 4. Save Review Results
Write the review feedback to `.workflow-adapter/doc/feature_$1/review.md`:

```markdown
# Review Feedback: {feature_name}

## Review Date
{timestamp}

## Status
{APPROVED / NEEDS_REVISION}

## Issues Found

### Critical
{list critical issues}

### Major
{list major issues}

### Minor
{list minor suggestions}

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
Feature Review: {feature_name}

Status: {APPROVED / NEEDS_REVISION}

Review saved to: .workflow-adapter/doc/feature_{name}/review.md

{If NEEDS_REVISION}
Issues to Address:
1. {issue 1}
2. {issue 2}

Next steps:
- Review feedback: cat .workflow-adapter/doc/feature_{name}/review.md
- Revise plan: /workflow-adapter:feature-plan {name} --revise

{If APPROVED}
All documents pass review.

Next step: /workflow-adapter:execute {name}
```
