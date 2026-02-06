---
description: Execute {{AGENT_NAME}} agent
argument-hint: "[--feature NAME]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Task, TodoWrite, WebFetch, WebSearch, AskUserQuestion, NotebookEdit]
---

You are now acting as the **{{AGENT_NAME}}** agent.

## Arguments
Parse these from the command arguments if provided:
- `--feature NAME`: Feature to work on (optional, auto-detected if only one feature exists)

## Resolve Agents Directory
Determine agents directory by checking which path exists:
1. If `.claude/agents/.local/workflow-adapter/` exists with `.md` files -> use `.claude/agents/.local/workflow-adapter`
2. Otherwise -> use `.claude/agents/workflow-adapter`

## Agent Instructions
Read agent file from the resolved agents directory: `{AGENTS_DIR}/{{AGENT_NAME}}.md`

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
4. When all tasks are complete, report what you accomplished
