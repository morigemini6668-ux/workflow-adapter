---
description: Validate workflow completion with orchestrator and reviewer
argument-hint: [feature-name]
allowed-tools: [Read, Task, Glob]
---

Validate that the workflow is complete using orchestrator and reviewer agents.

## Arguments
- `$1`: Feature name (optional, will auto-detect if only one feature exists)

## Tasks to Perform

### 1. Identify Feature
If feature name provided, use it.
Otherwise, scan `.workflow-adapter/doc/` for feature folders.
If multiple features exist, ask user which one to validate.

### 2. Gather Status Information
Read these files:
- Plan: `.workflow-adapter/doc/feature_$1/plan.md`
- Messages: List files in `.workflow-adapter/doc/feature_$1/messages/`
- Logs: Check `.workflow-adapter/logs/` for recent activity

### 3. Orchestrator Validation
Use Task tool to launch orchestrator validation:

```
You are the Orchestrator. Validate that the workflow for feature '{feature_name}' is complete.

## Current Plan Status
{plan.md content}

## Messages
{list of message files}

## Validation Checklist
Check each item:

1. **Task Completion**
   - Are all tasks in plan.md marked as done?
   - List any incomplete tasks

2. **Message Resolution**
   - Are there any unanswered messages?
   - Are there any pending requests?

3. **Agent Status**
   - Did all agents signal completion?
   - Check logs for TASKS_COMPLETE signals

4. **Dependencies**
   - Were all dependencies respected?
   - Any tasks completed out of order?

## Output
Provide:
- Completion percentage
- List of incomplete items (if any)
- Recommendation: COMPLETE | INCOMPLETE
```

### 4. Reviewer Validation
If orchestrator says COMPLETE, launch reviewer validation:

```
You are the Reviewer. Validate that the implementation for feature '{feature_name}' meets the specification.

## Specification
{spec.md content}

## Implementation Status
{summary of what was implemented}

## Validation Checklist

1. **Requirement Coverage**
   - Are all must-have requirements implemented?
   - Are nice-to-have requirements addressed?

2. **Acceptance Criteria**
   - Does implementation meet each criterion?
   - List any unmet criteria

3. **Quality Check**
   - Does code follow project standards?
   - Are edge cases handled?
   - Is documentation complete?

## Output
Provide:
- Overall assessment: APPROVED | NEEDS_WORK
- List of issues (if any)
- Recommendations
```

### 5. Final Report
Generate validation report:

```markdown
# Workflow Validation Report

## Feature: {feature_name}
## Date: {timestamp}

## Orchestrator Assessment
- Status: {COMPLETE / INCOMPLETE}
- Task Completion: {percentage}%
- Incomplete Tasks: {list or "None"}
- Pending Messages: {count}

## Reviewer Assessment
- Status: {APPROVED / NEEDS_WORK}
- Requirements Met: {percentage}%
- Issues Found: {list or "None"}

## Final Verdict
{WORKFLOW_COMPLETE / WORKFLOW_INCOMPLETE}

{If INCOMPLETE}
## Action Items
1. {action item}
2. {action item}

{If COMPLETE}
## Summary
All tasks completed and validated.
Feature '{feature_name}' is ready for deployment/merge.
```

### 6. Output Summary
Display the validation report to user.

If complete:
```
Workflow validation: COMPLETE

All tasks finished and reviewed.
Feature '{feature_name}' is ready!
```

If incomplete:
```
Workflow validation: INCOMPLETE

Action items:
1. {item}
2. {item}

Run /workflow-adapter:execute to continue, or address issues manually.
```
