---
description: Generate implementation plan for a triaged fix
argument-hint: <name> [--revise]
allowed-tools: [Read, Write, AskUserQuestion, Glob, WebSearch, WebFetch, Grep, Bash, Task, TodoWrite, Skill]
---

Generate an implementation plan for a triaged fix with tasks assigned to each agent.

## Important Constraints
- **DO NOT use Plan subagent** (subagent_type=Plan). This command IS the planning step.
- You MUST write the final plan directly to `.workflow-adapter/doc/fix_$1/plan.md` file using Write tool.
- Never delegate the plan creation to another agent.

## Arguments
- `$1`: Fix name (required)
- `--revise`: Revise existing plan based on review feedback (optional)

## Tasks to Perform

### 1. Parse Arguments
- Extract fix name from `$1`
- Check if `--revise` flag is present

### 2. Validate Prerequisites
Check that these files exist:
- `.workflow-adapter/doc/fix_$1/context.md` (project context)
- `.workflow-adapter/doc/fix_$1/triage.md` (triage report)

If `--revise` flag is present, also check:
- `.workflow-adapter/doc/fix_$1/plan.md` (existing plan)
- `.workflow-adapter/doc/fix_$1/review.md` (review feedback)

If required files missing, inform user to run previous steps.

### 3. Discover Available Agents
List all agent files in `.workflow-adapter/agents/`:
```bash
ls .workflow-adapter/agents/*.md
```

Extract agent names (excluding reviewer and orchestrator for task assignment).

### 4. Read Context and Triage
@.workflow-adapter/doc/fix_$1/context.md
@.workflow-adapter/doc/fix_$1/triage.md

**Use triage when planning:**
- Focus on the identified root cause
- Follow the chosen solution approach
- Consider the impact scope for task assignment
- Apply risk mitigations in task design

### 5. (If --revise) Interactive Plan Revision
If `--revise` flag is present:

#### 5.1 Read Current State
Read the existing plan:
@.workflow-adapter/doc/fix_$1/plan.md

Read review feedback (if exists):
@.workflow-adapter/doc/fix_$1/review.md

#### 5.2 Present Current Issues
Summarize the current plan and any issues found:
- List Critical/Major issues from review.md (if exists)
- Show current task distribution
- Highlight potential problems

#### 5.3 Interactive Revision
Use `AskUserQuestion` to gather revision requirements:

```yaml
question: "What aspects of the fix plan would you like to revise?"
header: "Revise"
options:
  - label: "Task assignments"
    description: "Change which agent handles which tasks"
  - label: "Task breakdown"
    description: "Add, remove, or modify tasks"
  - label: "Fix approach"
    description: "Change the solution strategy"
  - label: "Address review issues"
    description: "Fix issues identified in the review"
multiSelect: true
```

Apply user feedback and confirm before finalizing.

### 6. Generate Implementation Plan
Break down the fix into tasks based on triage report.

**Task Generation Strategy for Fixes:**

1. **Preparation Tasks** (Phase 1)
   - Create/update test cases to reproduce the issue
   - Set up debugging environment if needed

2. **Fix Implementation Tasks** (Phase 2)
   - Based on "Proposed Solutions" from triage.md
   - One task per affected file/component
   - Include code changes and necessary refactoring

3. **Verification Tasks** (Phase 3)
   - Run existing tests
   - Add new tests for the fix
   - Manual verification of the fix

4. **Cleanup Tasks** (Phase 4)
   - Documentation updates
   - Code cleanup if needed

Write to `.workflow-adapter/doc/fix_$1/plan.md`:

```markdown
# Fix Implementation Plan: {fix_name}

## Overview
- Fix: {fix_name}
- Issue Type: {from triage.md}
- Severity: {from triage.md}
- Created: {timestamp}
- Status: PLANNING | IN_PROGRESS | REVIEW | COMPLETE

## Root Cause Summary
{Brief root cause from triage.md}

## Chosen Solution
{Selected solution from triage.md}

## Available Agents
| Agent | Role | Status |
|-------|------|--------|
| alpha | Worker | Available |
| beta | Worker | Available |
| gamma | Worker | Available |
| orchestrator | Coordinator | Available |
| reviewer | Validator | Available |

## Task Breakdown

### Phase 1: Preparation
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-001 | Create regression test for {issue} | alpha | TODO | - |
| T-002 | Set up test environment | beta | TODO | - |

### Phase 2: Implementation
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-003 | Fix {component} in `{file}` | alpha | TODO | T-001 |
| T-004 | Update related code in `{file}` | beta | TODO | T-003 |

### Phase 3: Verification
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-005 | Run all affected tests | gamma | TODO | T-003, T-004 |
| T-006 | Manual verification | reviewer | TODO | T-005 |

### Phase 4: Cleanup (if needed)
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-007 | Update documentation | gamma | TODO | T-006 |

## Agent Todo Lists

### alpha
- [ ] T-001: Create regression test
- [ ] T-003: Fix {component}

### beta
- [ ] T-002: Set up test environment
- [ ] T-004: Update related code

### gamma
- [ ] T-005: Run tests
- [ ] T-007: Update documentation

### reviewer
- [ ] T-006: Manual verification

### orchestrator
- [ ] Validate completion and coordinate

## Agent Guidance

각 agent가 task 수행 시 참고해야 할 맞춤 가이던스입니다.

### alpha
**담당 Task:** {task_ids}

**규율 (Rules):**
- {Based on triage risk assessment}
- {Coding standards from context}

**주의사항 (Considerations):**
- {Edge cases identified in triage}
- {Risk mitigations to apply}

**탐색 영역 (Exploration):**
- `{affected file}` - main fix location
- `{related file}` - verify no side effects

---

### beta
{Similar structure}

---

(각 worker agent마다 반복)

## Risk Mitigations
{From triage.md risk assessment}

| Risk | Mitigation Task |
|------|-----------------|
| {risk from triage} | {how it's addressed in tasks} |

## Testing Strategy
- Regression test: T-001 ensures issue doesn't recur
- Unit tests: {scope}
- Integration tests: {scope}
- Manual tests: {scope}

## Rollback Plan
{From triage.md}

## Milestones
| Milestone | Tasks | Target |
|-----------|-------|--------|
| M1: Reproduced | T-001, T-002 | - |
| M2: Fixed | T-003, T-004 | - |
| M3: Verified | T-005, T-006 | - |
| M4: Complete | T-007 | - |

## Notes
- Based on triage report: triage.md
- Solution approach: {chosen solution name}

---
_Plan created: {timestamp}_
_Based on: context.md, triage.md_
```

### 7. Draft Agent Guidance
For each worker agent with assigned tasks:

1. Analyze the tasks assigned to this agent
2. Review triage.md for relevant constraints and risks
3. Draft guidance with three sections:

**규율 (Rules):**
- Risk mitigations from triage
- Testing requirements
- Code style from context

**주의사항 (Considerations):**
- Specific risks for their tasks
- Edge cases to handle
- Dependencies to respect

**탐색 영역 (Exploration):**
- Files mentioned in triage impact scope
- Related code to verify

### 8. Interactive Guidance Refinement
For each agent with tasks, use `AskUserQuestion` to refine the guidance:

```yaml
question: "{AGENT_NAME}에게 할당된 task:\n{task_list}\n\n가이던스 초안:\n\n**규율:**\n{rules}\n\n**주의사항:**\n{considerations}\n\n**탐색영역:**\n{exploration}\n\n수정이 필요하신가요?"
header: "{AGENT_NAME}"
options:
  - label: "확인, 다음으로"
    description: "이 agent 가이던스 확정"
  - label: "규율 수정"
    description: "따라야 할 규칙 변경"
  - label: "주의사항 수정"
    description: "신경써야 할 부분 변경"
  - label: "탐색 영역 수정"
    description: "참고 코드/문서 변경"
multiSelect: true
```

If user selects modifications, ask for specific changes via "Other" input.
Apply user feedback and confirm before proceeding to next agent.

### 9. Distribute Tasks
Ensure each worker agent has appropriate tasks:
- Alpha: Usually handles core fix implementation
- Beta: Handles related changes and updates
- Gamma: Handles testing and verification support

For simpler fixes, fewer agents may be needed.

### 10. Output Summary

**If new plan (no --revise):**
```
Fix implementation plan for '{fix_name}' created:
.workflow-adapter/doc/fix_{name}/plan.md

Task distribution:
- alpha: {n} tasks (core fix)
- beta: {n} tasks (related changes)
- gamma: {n} tasks (testing/docs)

Risk mitigations applied from triage.

Next step:
- Run /workflow-adapter:fix-review {name} to review the plan
- Or run /workflow-adapter:execute {name} --fix to start fix execution
```

**If revised plan (--revise):**
```
Fix implementation plan for '{fix_name}' REVISED:
.workflow-adapter/doc/fix_{name}/plan.md

Revision summary:
- Changes applied: {list}
- Review issues addressed: {count}

Next step:
- Run /workflow-adapter:fix-review {name} to re-review
```
