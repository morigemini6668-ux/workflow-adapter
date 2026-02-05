---
description: Initialize workflow with N worker agents + reviewer + orchestrator
argument-hint: [count]
allowed-tools: [Read, Write, Edit, Bash, Glob]
---

Initialize the workflow-adapter system in the current project.

## Arguments
- `$ARGUMENTS` or `$1`: Number of worker agents to create (default: 3)
- `--local`: Install agents to `.claude/agents/.local/workflow-adapter` instead of `.claude/agents/workflow-adapter`

## File Write Strategy
**IMPORTANT:** Before writing any file, check if it already exists:
- If file does NOT exist: Use **Write** tool to create it
- If file ALREADY exists: Use **Edit** tool to replace entire content

This prevents errors when re-running install on existing setup.

## Tasks to Perform

### 1. Parse Arguments
Get the count from arguments. If not provided, default to 3.
Valid range: 1-24 (Greek alphabet limit)

Check if `--local` flag is present in arguments.
- If `--local`: Use `.claude/agents/.local/workflow-adapter` as AGENTS_DIR
- Otherwise: Use `.claude/agents/workflow-adapter` as AGENTS_DIR

### 2. Check Existing Installation
Use Glob to check if `.workflow-adapter/` already exists:
- If exists: This is an UPDATE (inform user, use Edit for existing files)
- If not exists: This is a NEW installation (use Write for all files)

### 3. Create Directory Structure
Create these directories in the project root:
```
.workflow-adapter/
├── doc/
└── logs/

.claude/
├── agents/{workflow-adapter OR .local/workflow-adapter}  # Agents (Sub-agents for Task tool)
└── commands/workflow-adapter/                             # Slash commands
```

Use Bash to create directories (use AGENTS_DIR determined in step 1):
```bash
# If --local flag:
mkdir -p .workflow-adapter/doc .workflow-adapter/logs .claude/agents/.local/workflow-adapter .claude/commands/workflow-adapter

# If no --local flag (default):
mkdir -p .workflow-adapter/doc .workflow-adapter/logs .claude/agents/workflow-adapter .claude/commands/workflow-adapter
```

### 4. Copy Principle Template
Read the principle template: @${CLAUDE_PLUGIN_ROOT}/templates/principle.md

Target: `.workflow-adapter/doc/principle.md`
- Check if file exists, then Write (new) or Edit (update)

### 5. Generate Worker Agents

**Greek alphabet names (in order):**
1. alpha, 2. beta, 3. gamma, 4. delta, 5. epsilon, 6. zeta, 7. eta, 8. theta,
9. iota, 10. kappa, 11. lambda, 12. mu, 13. nu, 14. xi, 15. omicron, 16. pi,
17. rho, 18. sigma, 19. tau, 20. upsilon, 21. phi, 22. chi, 23. psi, 24. omega

For each agent (up to count, using the Greek names above in order):
1. Read worker template: @${CLAUDE_PLUGIN_ROOT}/templates/worker-agent.md
2. Replace `{{AGENT_NAME}}` with the Greek letter name
3. Target: `{AGENTS_DIR}/{name}.md` (use the AGENTS_DIR determined in step 1)
   - Check if file exists, then Write (new) or Edit (update)

### 6. Generate Reviewer Agent
Read the reviewer template: @${CLAUDE_PLUGIN_ROOT}/templates/reviewer-agent.md

Target: `{AGENTS_DIR}/reviewer.md` (use the AGENTS_DIR determined in step 1)
- Check if file exists, then Write (new) or Edit (update)

### 7. Generate Orchestrator Agent
Read template: @${CLAUDE_PLUGIN_ROOT}/templates/orchestrator-agent.md

Target: `{AGENTS_DIR}/orchestrator.md` (use the AGENTS_DIR determined in step 1)
- Check if file exists, then Write (new) or Edit (update)

### 8. Create Dynamic Commands
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
- Sub-agents installed
- Commands created/updated
- Directory structure

**Example output (new installation):**
```
Workflow initialized successfully! (NEW)

Created agents:
- Workers: alpha, beta, gamma
- Special: reviewer, orchestrator

Agents installed (for Task tool):
- workflow-adapter:alpha
- workflow-adapter:beta
- workflow-adapter:gamma
- workflow-adapter:reviewer
- workflow-adapter:orchestrator

Commands available:
- /workflow-adapter:alpha, /workflow-adapter:beta, /workflow-adapter:gamma
- /workflow-adapter:reviewer, /workflow-adapter:orchestrator

Directory structure:
.workflow-adapter/
├── doc/
│   └── principle.md
└── logs/

.claude/
├── agents/workflow-adapter/ (5 agents)   # or .local/workflow-adapter/ if --local
└── commands/workflow-adapter/ (5 commands)

Installation path: .claude/agents/workflow-adapter/  # or .claude/agents/.local/workflow-adapter/ if --local
```

**Example output (update):**
```
Workflow updated successfully! (UPDATE)

Updated agents:
- Workers: alpha, beta, gamma
- Special: reviewer, orchestrator

Agents updated:
- workflow-adapter:alpha, workflow-adapter:beta, workflow-adapter:gamma
- workflow-adapter:reviewer, workflow-adapter:orchestrator

Commands updated:
- /workflow-adapter:alpha, /workflow-adapter:beta, /workflow-adapter:gamma
- /workflow-adapter:reviewer, /workflow-adapter:orchestrator

Existing feature documents preserved in .workflow-adapter/doc/
```
