---
description: Initialize workflow with N worker agents + reviewer + orchestrator
argument-hint: [count]
allowed-tools: [Read, Write, Edit, Bash, Glob]
---

Initialize the workflow-adapter system in the current project.

## Arguments
- `$ARGUMENTS` or `$1`: Number of worker agents to create (default: 3)

## File Write Strategy
**IMPORTANT:** Before writing any file, check if it already exists:
- If file does NOT exist: Use **Write** tool to create it
- If file ALREADY exists: Use **Edit** tool to replace entire content

This prevents errors when re-running install on existing setup.

## Tasks to Perform

### 1. Parse Agent Count
Get the count from arguments. If not provided, default to 3.
Valid range: 1-24 (Greek alphabet limit)

### 2. Check Existing Installation
Use Glob to check if `.workflow-adapter/` already exists:
- If exists: This is an UPDATE (inform user, use Edit for existing files)
- If not exists: This is a NEW installation (use Write for all files)

### 3. Create Directory Structure
Create these directories in the project root:
```
.workflow-adapter/
├── agents/
├── doc/
└── logs/
```

Use Bash to create directories:
```bash
mkdir -p .workflow-adapter/agents .workflow-adapter/doc .workflow-adapter/logs
```

### 4. Copy Principle Template
Read the principle template: @${CLAUDE_PLUGIN_ROOT}/templates/principle.md

Target: `.workflow-adapter/doc/principle.md`
- Check if file exists, then Write (new) or Edit (update)

### 5. Generate Worker Agents
Read the Greek alphabet list:
@${CLAUDE_PLUGIN_ROOT}/scripts/greek-alphabet.txt

For each agent (up to count):
1. Read worker template: @${CLAUDE_PLUGIN_ROOT}/templates/worker-agent.md
2. Replace `{{AGENT_NAME}}` with the Greek letter name
3. Target: `.workflow-adapter/agents/{name}.md`
   - Check if file exists, then Write (new) or Edit (update)

### 6. Generate Reviewer Agent
Read the reviewer template: @${CLAUDE_PLUGIN_ROOT}/templates/reviewer-agent.md

Target: `.workflow-adapter/agents/reviewer.md`
- Check if file exists, then Write (new) or Edit (update)

### 7. Generate Orchestrator Agent
Read template: @${CLAUDE_PLUGIN_ROOT}/templates/orchestrator-agent.md

Target: `.workflow-adapter/agents/orchestrator.md`
- Check if file exists, then Write (new) or Edit (update)

### 8. Create Dynamic Commands
Create `.claude/commands/workflow-adapter/` directory in the project.

For each agent created (workers + reviewer + orchestrator):
1. Read command template: @${CLAUDE_PLUGIN_ROOT}/templates/agent-command.md
2. Replace `{{AGENT_NAME}}` with the agent name
3. Target: `.claude/commands/workflow-adapter/{name}.md`
   - Check if file exists, then Write (new) or Edit (update)

### 9. Output Summary
Report what was created or updated:
- Installation type (NEW or UPDATE)
- Number of worker agents and their names
- Special agents (reviewer, orchestrator)
- Commands created/updated
- Directory structure

**Example output (new installation):**
```
Workflow initialized successfully! (NEW)

Created agents:
- Workers: alpha, beta, gamma
- Special: reviewer, orchestrator

Commands available:
- /alpha, /beta, /gamma
- /reviewer, /orchestrator

Directory structure:
.workflow-adapter/
├── agents/ (5 agents)
├── doc/
│   └── principle.md
└── logs/

.claude/
└── commands/workflow-adapter/ (agent commands)
```

**Example output (update):**
```
Workflow updated successfully! (UPDATE)

Updated agents:
- Workers: alpha, beta, gamma
- Special: reviewer, orchestrator

Commands updated:
- /alpha, /beta, /gamma
- /reviewer, /orchestrator

Existing feature documents preserved in .workflow-adapter/doc/
```
