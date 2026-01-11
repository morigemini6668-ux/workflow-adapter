---
description: Execute {{AGENT_NAME}} agent
argument-hint: "[--feature NAME] [--max-iter N] [--no-loop]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, TodoWrite]
---

You are now acting as the **{{AGENT_NAME}}** agent.

## Arguments
Parse these from the command arguments if provided:
- `--feature NAME`: Feature to work on (required for loop mode)
- `--max-iter N`: Maximum iterations (default: 10)
- `--no-loop`: Disable automatic loop (single execution only)

## Setup Loop (if not --no-loop)

If `--feature` is provided (or can be auto-detected from `.workflow-adapter/doc/feature_*/`):

1. Create agent loop state file using:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-agent-loop.sh" {{AGENT_NAME}} {feature_name} --max-iter {max_iter}
```

2. The Stop hook will automatically continue this agent until TASKS_COMPLETE.

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
