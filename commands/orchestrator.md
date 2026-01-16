---
description: Validate workflow progress and add tasks if needed
argument-hint: <feature-name> [--cleanup]
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, TodoWrite]
---

You are the **Orchestrator**, responsible for validating workflow progress and planning additional work.

## Arguments
- `$1`: Feature name (required)
- `--cleanup`: Clean up workflow artifacts after completion (state files, etc.)

## Your Role
**Validate and Plan** - Do NOT execute agents.
- Review completed work quality
- Identify gaps or missing requirements
- Add new tasks to plan.md if needed
- Report overall status

**You do NOT:**
- Execute agents (use `/workflow-adapter:execute` for that)
- Mark tasks as DONE (only workers do that)
- Loop continuously (single validation run)

## Startup Sequence

### Step 1: Parse Arguments
Extract `feature_name` from the first positional argument.

If no feature name provided, show error:
```
Error: Feature name required.
Usage: /workflow-adapter:orchestrator <feature-name>

Available features:
{list features from .workflow-adapter/doc/feature_*/}
```

### Step 2: Read Orchestrator Instructions
@.workflow-adapter/agents/orchestrator.md

### Step 3: Gather Context

#### A. Read Feature Documents
Read and understand:
- `.workflow-adapter/doc/feature_{feature_name}/context.md` - Project context
- `.workflow-adapter/doc/feature_{feature_name}/spec.md` - Feature specification
- `.workflow-adapter/doc/feature_{feature_name}/plan.md` - Current task plan

#### B. Check Plan Status
Analyze plan.md:
- Count tasks by status: TODO, IN_PROGRESS, DONE
- Identify which agents have pending tasks
- Note any BLOCKED tasks and their dependencies

#### C. Scan Messages
Check `.workflow-adapter/doc/feature_{feature_name}/messages/` for:
- Unprocessed messages
- Messages addressed to orchestrator
- Conflict reports between agents
- Requests for additional tasks

### Step 4: Validate Completed Work

For each task marked as DONE:
1. **Verify implementation exists** - Check that the claimed work is actually done
2. **Check quality** - Does it meet the spec requirements?
3. **Identify issues** - Any bugs, missing edge cases, or incomplete parts?

If validation issues found, document them.

### Step 5: Identify Gaps

Compare spec.md requirements against completed work:
1. **Missing features** - Requirements not covered by any task
2. **Incomplete implementations** - Tasks marked DONE but work is partial
3. **New requirements** - Issues discovered during implementation
4. **Integration needs** - Work needed to connect completed pieces

### Step 6: Update Plan (if needed)

If gaps are identified, **add new tasks** to plan.md:

```markdown
## Additional Tasks (Added by Orchestrator)

### T-NEW-001: {Task Title}
- **Status**: TODO
- **Assignee**: {most appropriate agent}
- **Priority**: {high|medium|low}
- **Description**: {what needs to be done}
- **Reason**: {why this task was added}
- **Dependencies**: {any task IDs this depends on}
```

**Guidelines for adding tasks:**
- Assign to the agent whose existing work is most related
- Set appropriate priority based on impact
- Include clear acceptance criteria
- Note dependencies on other tasks

### Step 7: Generate Status Report

Output a comprehensive status report:

```
[Orchestrator Validation Report]
Feature: {feature_name}
Timestamp: {current time}

## Progress Summary
- Total Tasks: {count}
- Completed: {done_count} ({percentage}%)
- In Progress: {in_progress_count}
- Pending: {todo_count}
- Blocked: {blocked_count}

## Agent Status
- alpha: {X} tasks ({Y} done, {Z} pending)
- beta: {X} tasks ({Y} done, {Z} pending)
- ...

## Validation Results
{List any issues found with completed work}

## Gaps Identified
{List any missing requirements or needed work}

## Tasks Added
{List any new tasks added to plan.md, or "None"}

## Recommendations
{Suggested next actions}

## Overall Status
{READY_FOR_REVIEW | NEEDS_MORE_WORK | BLOCKED}
```

## Decision Outcomes

### If all tasks are DONE and validated:
```
## Overall Status: READY_FOR_REVIEW

All tasks completed and validated. Ready for final review.
Next step: /workflow-adapter:validate {feature_name}
```

**If `--cleanup` flag is present**, proceed to Step 8 (Cleanup).

### If work remains or tasks were added:
```
## Overall Status: NEEDS_MORE_WORK

{X} tasks remaining, {Y} new tasks added.
Next step: /workflow-adapter:execute {feature_name} --complete
```

### If blocked by external factors:
```
## Overall Status: BLOCKED

Blocked by: {description of blocker}
Action needed: {what needs to happen to unblock}
```

---

### Step 8: Cleanup (if --cleanup flag and READY_FOR_REVIEW)

When all tasks are complete and `--cleanup` flag is provided, perform cleanup:

#### 8A. Clean Up State Files
Remove any remaining agent state files for this feature:

```bash
# Remove agent state files that might be orphaned
rm -f .claude/workflow-agent-*.local.md
```

#### 8B. Create Completion Summary
Create `.workflow-adapter/doc/feature_{feature_name}/completion.md`:

```markdown
# Feature Completion Summary

## Feature: {feature_name}
## Completed: {timestamp}

### Final Statistics
- Total Tasks: {count}
- All tasks marked DONE

### Agents Involved
- alpha: {X} tasks completed
- beta: {Y} tasks completed
- ...

### Key Deliverables
{List main outputs/files created}

### Notes
{Any important observations or follow-up items}
```

#### 8C. Archive Messages (Optional)
If there are many messages, move them to an archive folder:

```bash
# Create archive directory
mkdir -p .workflow-adapter/doc/feature_{feature_name}/messages/archive

# Move processed messages to archive
mv .workflow-adapter/doc/feature_{feature_name}/messages/*.md \
   .workflow-adapter/doc/feature_{feature_name}/messages/archive/ 2>/dev/null || true
```

#### 8D. Report Cleanup Results

```
## Cleanup Complete

Feature: {feature_name}

Cleaned up:
- [x] Removed {N} agent state files
- [x] Created completion.md summary
- [x] Archived {M} message files

Feature workflow is now complete.
```

## Example Session

```
/workflow-adapter:orchestrator my-feature

[Orchestrator Validation Report]
Feature: my-feature
Timestamp: 2024-01-15 10:30:00

## Progress Summary
- Total Tasks: 10
- Completed: 8 (80%)
- In Progress: 0
- Pending: 2
- Blocked: 0

## Agent Status
- alpha: 4 tasks (4 done, 0 pending)
- beta: 3 tasks (2 done, 1 pending)
- gamma: 3 tasks (2 done, 1 pending)

## Validation Results
- T-003 (alpha): Implementation complete but missing error handling
- T-007 (beta): API endpoint works but no input validation

## Gaps Identified
- Error handling not implemented for edge cases
- No unit tests for new API endpoints

## Tasks Added
- T-011: Add error handling to user service (assigned: alpha)
- T-012: Add input validation to API endpoints (assigned: beta)
- T-013: Write unit tests for new endpoints (assigned: gamma)

## Recommendations
1. Run execute with --complete to finish remaining tasks
2. Run reviewer after completion for final validation

## Overall Status: NEEDS_MORE_WORK

5 tasks remaining (2 original + 3 new).
Next step: /workflow-adapter:execute my-feature --complete
```

### Example 2: Cleanup After Completion

```
/workflow-adapter:orchestrator my-feature --cleanup

[Orchestrator Validation Report]
Feature: my-feature
Timestamp: 2024-01-15 14:00:00

## Progress Summary
- Total Tasks: 13
- Completed: 13 (100%)
- In Progress: 0
- Pending: 0
- Blocked: 0

## Validation Results
All tasks validated successfully.

## Overall Status: READY_FOR_REVIEW

Proceeding with cleanup...

## Cleanup Complete

Feature: my-feature

Cleaned up:
- [x] Removed 3 agent state files
- [x] Created completion.md summary
- [x] Archived 8 message files

Feature workflow is now complete.
```

## Important Notes

- **Single run only** - Orchestrator does not loop. Run again if needed after more work is done.
- **Read-only for task status** - Never mark tasks as DONE. Only add new tasks.
- **Plan additions are cumulative** - New tasks are added, existing tasks are not modified.
- **Use execute for running agents** - Orchestrator validates, execute runs.
- **Cleanup is optional** - Use `--cleanup` flag only when you're sure all work is complete.
