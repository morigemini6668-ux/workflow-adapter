---
description: Execute all agents in background
argument-hint: <feature-name> [--in-session] [--max-iter N] [--complete]
allowed-tools: [Read, Write, Bash, Glob, Task]
---

Execute all workflow agents for a specific feature. Uses Stop hook for automatic task continuation.

## Arguments
- `$1`: Feature name (required) - the feature to execute
- `--in-session`: Run agents within current Claude session (default: false)
- `--max-iter N`: Maximum iterations per agent (default: 10)
- `--complete`: Continue until ALL tasks in plan.md are DONE, even if blocked by dependencies

## Prerequisites
Before running execute:
1. Workflow must be initialized (`/workflow-adapter:install`)
2. Feature must have a plan (`/workflow-adapter:feature-plan {name}`)

## Tasks to Perform

### 1. Validate Feature Name
If no feature name provided, show error:
```
Error: Feature name required.
Usage: /workflow-adapter:execute <feature-name> [--in-session] [--max-iter N]

Available features:
{list features from .workflow-adapter/doc/feature_*/}
```

### 2. Validate Setup
Check that `.workflow-adapter/agents/` exists and contains agent files.
If not, inform user to run install first.

### 3. Check Feature Exists
Check that `.workflow-adapter/doc/feature_$1/plan.md` exists.
If not found, inform user:
```
Error: Feature '{name}' not found or has no plan.
Run /workflow-adapter:feature-plan {name} first.
```

### 4. Parse Arguments
- Feature name from `$1`
- Check if `--in-session` flag is present
- Extract max iterations from `--max-iter N`. Default to 10 if not specified.
- Check if `--complete` flag is present (enables plan.md verification for completion)

### 5. Read Feature Plan
@.workflow-adapter/doc/feature_$1/plan.md

Extract assigned tasks for each agent from the plan.

### 6. Execute Based on Mode

---

## Mode A: Background Script Execution (Default)

**IMPORTANT: You MUST use the Bash tool to execute the script. Do NOT use Task tool for this mode.**

Use Bash tool to run the execution script:

```bash
# Without --complete flag:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {feature_name} {max_iter}

# With --complete flag:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {feature_name} {max_iter} --complete
```

This script will:
- Create state files for each agent (`.claude/workflow-agent-{name}.local.md`)
- Start each agent as a background process using `claude --print`
- The Stop hook automatically continues each agent until TASKS_COMPLETE
- Output logged to `.workflow-adapter/logs/`

**After running the script, show this message:**
```
Agent execution started via background script!

Logs directory: .workflow-adapter/logs/

To monitor progress:
- Check logs: tail -f .workflow-adapter/logs/*.log
- Check messages: ls .workflow-adapter/doc/feature_{name}/messages/
- Check plan status: cat .workflow-adapter/doc/feature_{name}/plan.md
- Cancel agents: /workflow-adapter:cancel-agent --all

After execution, run /workflow-adapter:validate {name} to verify completion.
```

---

## Mode B: In-Session Execution (--in-session flag)

**IMPORTANT: Only use this mode when --in-session flag is explicitly provided.**

Run agents within the current Claude session. The Stop hook handles automatic iteration.

### Step 1: Discover Agents
Read all agent files from `.workflow-adapter/agents/`:
- List all `.md` files
- Extract agent names (exclude orchestrator for now)
- Sort alphabetically (alpha, beta, gamma...)

### Step 2: Create State Files for All Agents
For each agent, create a state file using setup script:

```bash
# Without --complete flag:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-agent-loop.sh" {agent_name} {feature_name} --max-iter {max_iter}

# With --complete flag:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-agent-loop.sh" {agent_name} {feature_name} --max-iter {max_iter} --complete
```

The state files will be created at `.claude/workflow-agent-{name}.local.md`
With `--complete` flag, the state file will include `check_plan_completion: true`

### Step 3: Read First Agent Instructions
Read the first agent's (alphabetically, e.g., "alpha") full instructions from `.workflow-adapter/agents/{name}.md`.

### Step 4: Start First Agent
**Output the first agent's prompt directly** (not via Task tool). The Stop hook will:
1. Detect the agent's state file
2. Continue the agent until TASKS_COMPLETE
3. Automatically switch to the next agent
4. Complete when all agents are done

Output this prompt for the first agent:

```
You are the {first_agent_name} agent in a multi-agent workflow system.

## Feature: {feature_name}
You are working on the feature: {feature_name}

## Your Agent Instructions
{content from .workflow-adapter/agents/{first_agent_name}.md - skip YAML frontmatter}

## Your Assigned Tasks (from plan.md)
{Extract tasks assigned to this agent from .workflow-adapter/doc/feature_{feature_name}/plan.md}

## Workflow
1. Read .workflow-adapter/doc/principle.md for guidelines
2. Read .workflow-adapter/doc/feature_{feature_name}/context.md for project context
3. Work on YOUR assigned tasks from the plan above
4. Update task status in plan.md as you complete them (TODO -> IN_PROGRESS -> DONE)
5. Write messages to other agents if needed (to .workflow-adapter/doc/feature_{feature_name}/messages/)
6. When done, check .workflow-adapter/doc/feature_{feature_name}/messages/ for messages addressed to you
7. If blocked by dependencies, output WAITING_FOR_DEPENDENCY (will retry later)

When all your assigned tasks are complete and messages are processed, output: TASKS_COMPLETE
```

The Stop hook will automatically:
- Continue this agent until TASKS_COMPLETE
- If `--complete` mode, verify plan.md tasks are DONE before completing
- Handle WAITING_FOR_DEPENDENCY by retrying
- Switch to the next agent (beta, gamma, etc.)
- Complete the workflow when all agents finish

### Step 5: Completion Message (shown after all agents complete)
```
In-session execution complete for feature: {feature_name}

Agents executed: {list}

Check:
- Logs: .workflow-adapter/logs/
- Messages: .workflow-adapter/doc/feature_{feature_name}/messages/
- Plan status: .workflow-adapter/doc/feature_{feature_name}/plan.md

Run /workflow-adapter:validate {feature_name} to verify completion.
```

---

## How the Stop Hook Works

The workflow-adapter plugin includes a Stop hook (`hooks/agent-stop-hook.sh`) that:
1. Detects active agent state files in `.claude/`
2. Checks if the agent output contains TASKS_COMPLETE
3. If not complete: blocks session exit and re-injects the prompt
4. If complete: removes the state file and starts the next agent
5. When all agents complete: allows session to exit normally

This enables automatic task continuation without manual intervention.

---

## Troubleshooting

### If script execution fails:
1. Check that `claude` CLI is installed and in PATH
2. Verify `.workflow-adapter/agents/` has agent files
3. Check script permissions: `chmod +x scripts/*.sh`

### To cancel running agents:
```
/workflow-adapter:cancel-agent --all
```

### If an agent is stuck:
1. Check the agent's state file: `.claude/workflow-agent-{name}.local.md`
2. Check the iteration count - may have hit max_iterations
3. Cancel and restart: `/workflow-adapter:cancel-agent {name}` then run execute again

## Notes
- Both modes use the Stop hook for automatic task continuation
- Background mode provides true parallel execution (multiple Claude sessions)
- In-session mode runs agents sequentially (useful for debugging)
- Agents communicate via `.workflow-adapter/doc/feature_{feature_name}/messages/`
- State files in `.claude/workflow-agent-*.local.md` control the loop
