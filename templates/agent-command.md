---
description: Execute {{AGENT_NAME}} agent
argument-hint: "[--feature NAME] [--max-iter N] [--no-loop] [--complete]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Task, TodoWrite, WebFetch, WebSearch, AskUserQuestion, NotebookEdit]
---

You are now acting as the **{{AGENT_NAME}}** agent.

## Arguments
Parse these from the command arguments if provided:
- `--feature NAME`: Feature to work on (required for loop mode)
- `--max-iter N`: Maximum iterations (default: 10)
- `--no-loop`: Disable automatic loop (single execution only)
- `--complete`: Continue until ALL assigned tasks in plan.md are DONE (not just until TASKS_COMPLETE signal)

## Setup Loop (if not --no-loop)

If `--feature` is provided (or can be auto-detected from `.workflow-adapter/doc/feature_*/`):

Create the agent loop state file directly.

**If `--complete` flag is present**, add `check_plan_completion: true` to the frontmatter:

```bash
mkdir -p .claude && cat > .claude/workflow-agent-{{AGENT_NAME}}.local.md << 'STATEEOF'
---
active: true
agent_name: {{AGENT_NAME}}
feature_name: {feature_name}
iteration: 1
max_iterations: {max_iter}
completion_signal: "TASKS_COMPLETE"
check_plan_completion: true
started_at: "{timestamp}"
---

You are the {{AGENT_NAME}} agent. Execute your responsibilities now for feature: {feature_name}

## Your Feature
Feature: {feature_name}
Plan: .workflow-adapter/doc/feature_{feature_name}/plan.md
Context: .workflow-adapter/doc/feature_{feature_name}/context.md

## Workflow
1. Read .workflow-adapter/doc/principle.md for guidelines
2. Read .workflow-adapter/doc/feature_{feature_name}/context.md for project context
3. Read .workflow-adapter/doc/feature_{feature_name}/plan.md and find YOUR assigned tasks
4. Work on your assigned tasks and update their status in plan.md (TODO -> IN_PROGRESS -> DONE)
5. Check messages directory for messages addressed to you
6. If blocked by dependencies, output WAITING_FOR_DEPENDENCY (will retry later)
7. If all YOUR tasks are complete, output TASKS_COMPLETE

Note: With --complete mode, iteration continues until plan.md shows all your tasks as DONE.

Start working now.
STATEEOF
```

**If `--complete` flag is NOT present**, use `check_plan_completion: false`:

```bash
mkdir -p .claude && cat > .claude/workflow-agent-{{AGENT_NAME}}.local.md << 'STATEEOF'
---
active: true
agent_name: {{AGENT_NAME}}
feature_name: {feature_name}
iteration: 1
max_iterations: {max_iter}
completion_signal: "TASKS_COMPLETE"
check_plan_completion: false
started_at: "{timestamp}"
---

You are the {{AGENT_NAME}} agent. Execute your responsibilities now for feature: {feature_name}

## Your Feature
Feature: {feature_name}
Plan: .workflow-adapter/doc/feature_{feature_name}/plan.md
Context: .workflow-adapter/doc/feature_{feature_name}/context.md

## Workflow
1. Read .workflow-adapter/doc/principle.md for guidelines
2. Read .workflow-adapter/doc/feature_{feature_name}/context.md for project context
3. Read .workflow-adapter/doc/feature_{feature_name}/plan.md and find YOUR assigned tasks
4. Work on your assigned tasks and update their status in plan.md (TODO -> IN_PROGRESS -> DONE)
5. Check messages directory for messages addressed to you
6. If all YOUR tasks are complete, output TASKS_COMPLETE

Start working now.
STATEEOF
```

Replace `{feature_name}`, `{max_iter}`, and `{timestamp}` with actual values.

The Stop hook will automatically continue this agent until TASKS_COMPLETE (or until plan.md tasks are DONE in --complete mode).

## Agent Instructions
@.workflow-adapter/agents/{{AGENT_NAME}}.md

## Current Context
Read these files to understand your context:

### Principles (Required)
@.workflow-adapter/doc/principle.md

### Current Feature
If feature name is known, read:
- `.workflow-adapter/doc/feature_{name}/context.md`
- `.workflow-adapter/doc/feature_{name}/plan.md`

Otherwise, find and read the current feature documents in `.workflow-adapter/doc/feature_*/`

## Execution

Execute your agent responsibilities now:
1. Work on your assigned tasks from plan.md
2. Update task status as you complete them (TODO -> IN_PROGRESS -> DONE)
3. Check messages directory for any messages addressed to you
4. When all tasks complete, output: **TASKS_COMPLETE**

The Stop hook will automatically continue your work until you output TASKS_COMPLETE or reach max iterations.

## To Cancel
If you need to stop the agent loop manually:
```
/workflow-adapter:cancel-agent {{AGENT_NAME}}
```
