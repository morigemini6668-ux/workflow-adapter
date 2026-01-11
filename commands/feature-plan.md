---
description: Generate implementation plan with agent task assignments
argument-hint: <name> [--revise]
allowed-tools: [Read, Write, Glob, AskUserQuestion]
---

Generate an implementation plan with tasks assigned to each agent.

## Arguments
- `$1`: Feature name (required)
- `--revise`: Revise existing plan based on review feedback (optional)

## Tasks to Perform

### 1. Parse Arguments
- Extract feature name from `$1`
- Check if `--revise` flag is present

### 2. Validate Prerequisites
Check that these files exist:
- `.workflow-adapter/doc/feature_$1/context.md` (project context)
- `.workflow-adapter/doc/feature_$1/brainstorming.md`
- `.workflow-adapter/doc/feature_$1/spec.md`

If `--revise` flag is present, also check:
- `.workflow-adapter/doc/feature_$1/plan.md` (existing plan)
- `.workflow-adapter/doc/feature_$1/review.md` (review feedback)

If required files missing, inform user to run previous steps.

### 3. Discover Available Agents
List all agent files in `.workflow-adapter/agents/`:
```bash
ls .workflow-adapter/agents/*.md
```

Extract agent names (excluding reviewer and orchestrator for task assignment).

### 4. Read Context and Specification
@.workflow-adapter/doc/feature_$1/context.md
@.workflow-adapter/doc/feature_$1/spec.md

**Use context when planning:**
- Check for existing features that might need integration
- Consider project conventions when designing tasks
- Identify potential conflicts with existing implementations

### 5. (If --revise) Read Review Feedback and Existing Plan
If `--revise` flag is present:

Read the review feedback:
@.workflow-adapter/doc/feature_$1/review.md

Read the existing plan:
@.workflow-adapter/doc/feature_$1/plan.md

**When revising, you MUST:**
- Address ALL issues marked as Critical and Major in review.md
- Consider Minor issues and Recommendations
- Preserve what worked well in the existing plan
- Explain what changes you made and why in the Notes section

### 6. Generate Implementation Plan
Break down the feature into tasks and assign to agents.

Write to `.workflow-adapter/doc/feature_$1/plan.md`:

```markdown
# Implementation Plan: {feature_name}

## Overview
- Feature: {feature_name}
- Created: {timestamp}
- Status: PLANNING | IN_PROGRESS | REVIEW | COMPLETE

## Available Agents
| Agent | Role | Status |
|-------|------|--------|
| alpha | Worker | Available |
| beta | Worker | Available |
| gamma | Worker | Available |
| orchestrator | Coordinator | Available |
| reviewer | Validator | Available |

## Task Breakdown

### Phase 1: Setup
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-001 | {task description} | alpha | TODO | - |
| T-002 | {task description} | beta | TODO | T-001 |

### Phase 2: Core Implementation
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-003 | {task description} | alpha | TODO | T-001 |
| T-004 | {task description} | beta | TODO | T-002 |
| T-005 | {task description} | gamma | TODO | - |

### Phase 3: Integration
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-006 | {task description} | alpha | TODO | T-003, T-004 |

### Phase 4: Testing & Review
| Task ID | Description | Assignee | Status | Dependencies |
|---------|-------------|----------|--------|--------------|
| T-007 | Code review | reviewer | TODO | T-006 |
| T-008 | Final validation | orchestrator | TODO | T-007 |

## Agent Todo Lists

### alpha
- [ ] T-001: {task description}
- [ ] T-003: {task description}
- [ ] T-006: {task description}

### beta
- [ ] T-002: {task description}
- [ ] T-004: {task description}

### gamma
- [ ] T-005: {task description}

### reviewer
- [ ] T-007: Review all implementations

### orchestrator
- [ ] T-008: Validate completion and coordinate

## Milestones
| Milestone | Tasks | Target |
|-----------|-------|--------|
| M1: Setup Complete | T-001, T-002 | - |
| M2: Core Complete | T-003, T-004, T-005 | - |
| M3: Integration Complete | T-006 | - |
| M4: Feature Complete | T-007, T-008 | - |

## Integration with Existing Features
{From context.md - any integration tasks needed}
| Existing Feature | Integration Task | Assigned To |
|------------------|------------------|-------------|
| {feature name} | {what needs to be done} | {agent} |

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| {risk} | High/Medium/Low | {mitigation} |
| Conflict with existing features | Medium | Review context.md, coordinate with existing implementations |

## Notes
- {Any additional notes}
- Project context was considered from context.md

---
_Plan created: {timestamp}_
_Based on: context.md, spec.md_
```

### 7. Distribute Tasks
Ensure each worker agent has a balanced workload.
Consider dependencies when assigning tasks.

### 8. Output Summary

**If new plan (no --revise):**
```
Implementation plan for '{feature_name}' created:
.workflow-adapter/doc/feature_{name}/plan.md

Task distribution:
- alpha: {n} tasks
- beta: {n} tasks
- gamma: {n} tasks

Next step:
- Run /workflow-adapter:feature-review {name} to review the plan
- Or run /workflow-adapter:execute {name} to start agent execution
```

**If revised plan (--revise):**
```
Implementation plan for '{feature_name}' REVISED:
.workflow-adapter/doc/feature_{name}/plan.md

Changes made based on review feedback:
- {summary of changes addressing review issues}

Task distribution:
- alpha: {n} tasks
- beta: {n} tasks
- gamma: {n} tasks

Next step:
- Run /workflow-adapter:feature-review {name} to re-review the revised plan
```
