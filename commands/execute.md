---
description: Execute all agents in background
argument-hint: <name> [--in-session] [--max-iter N] [--complete] [--fix]
allowed-tools: [Read, Write, Bash, Glob, Task]
---

Execute all workflow agents for a specific feature or fix. Uses Stop hook for automatic task continuation.

## Arguments
- `$1`: Name (required) - the feature or fix name to execute
- `--in-session`: Run agents within current Claude session (default: false)
- `--max-iter N`: Maximum iterations per agent (default: 10)
- `--complete`: Continue until ALL tasks in plan.md are DONE, even if blocked by dependencies
- `--fix`: Execute for a fix workflow (uses `.workflow-adapter/doc/fix_*` instead of `feature_*`)

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
# For feature workflow:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {name} {max_iter}

# For fix workflow:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {name} {max_iter} --fix

# With --complete flag:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {name} {max_iter} --complete

# Fix with --complete:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/execute-agents.sh" {name} {max_iter} --fix --complete
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

Run agents as subagents within the current Claude session using Task tool.

### Step 1: Discover Agents
Read all agent files from `.workflow-adapter/agents/`:
- List all `.md` files
- Extract agent names (exclude orchestrator and reviewer for parallel execution)
- Sort alphabetically (alpha, beta, gamma...)

### Step 2: Read Agent Instructions and Tasks
For each worker agent:
1. Read agent instructions from `.workflow-adapter/agents/{name}.md`
2. Extract assigned tasks from `.workflow-adapter/doc/feature_{feature_name}/plan.md`

### Step 3: Launch Worker Agents in Parallel via Task Tool
**Use Task tool to launch all worker agents in parallel** (send multiple Task tool calls in a single message).

The agents are installed to `.claude/agents/` via `/workflow-adapter:install`, so use the agent name directly:
- `subagent_type: "alpha"`
- `subagent_type: "beta"`
- `subagent_type: "gamma"`
- etc.

For each worker agent, call Task tool with:

```yaml
subagent_type: "{agent_name}"
description: "{agent_name} agent for {feature_name}"
mode: "bypassPermissions"
prompt: |
  ## Feature: {feature_name}
  You are working on the feature: {feature_name}

  ## Your Assigned Tasks (from plan.md)
  {Extract tasks assigned to this agent from plan.md}

  ## Workflow
  1. Read .workflow-adapter/doc/principle.md for guidelines
  2. Read .workflow-adapter/doc/feature_{feature_name}/context.md for project context
  3. Work on YOUR assigned tasks from the plan above
  4. Update task status in plan.md as you complete them (TODO -> IN_PROGRESS -> DONE)
  5. Write messages to other agents if needed (to .workflow-adapter/doc/feature_{feature_name}/messages/)
  6. When done, check .workflow-adapter/doc/feature_{feature_name}/messages/ for messages addressed to you

  Complete all your assigned tasks, then report what you accomplished.
```

**Example: Launching 3 agents in parallel (single message with multiple Task calls):**
```
[Task call 1: subagent_type="alpha"]
[Task call 2: subagent_type="beta"]
[Task call 3: subagent_type="gamma"]
```

### Step 4: Wait for All Agents to Complete
Task tool will return results from each agent. Collect their outputs.

### Step 5: Run Reviewer Agent (if exists)
After all workers complete, launch the reviewer agent:

```yaml
subagent_type: "reviewer"
description: "reviewer agent for {feature_name}"
mode: "bypassPermissions"
prompt: |
  ## Feature: {feature_name}

  ## Review Tasks
  1. Read .workflow-adapter/doc/feature_{feature_name}/plan.md - check all tasks are DONE
  2. Check .workflow-adapter/doc/feature_{feature_name}/messages/ for any unresolved issues
  3. Verify the implementation quality

  Report your review findings.
```

### Step 6: Completion Message
```
In-session execution complete for feature: {feature_name}

Agents executed in parallel: {worker_list}
Reviewer: {reviewer_status}

Results:
- {agent_name}: {summary from Task result}
- ...

Check:
- Messages: .workflow-adapter/doc/feature_{feature_name}/messages/
- Plan status: .workflow-adapter/doc/feature_{feature_name}/plan.md

Run /workflow-adapter:validate {feature_name} to verify completion.
```

---

## How Each Mode Works

### Background Mode (Default)
Uses Stop hook (`hooks/agent-stop-hook.sh`) for automatic iteration:
1. Detects active agent state files in `.claude/`
2. Checks if the agent output contains TASKS_COMPLETE
3. If not complete: blocks session exit and re-injects the prompt
4. If complete: removes the state file and starts the next agent
5. When all agents complete: allows session to exit normally

### In-Session Mode (--in-session)
Uses Task tool to spawn subagents:
1. Each agent runs as a subagent via Task tool
2. Subagents execute until completion (no Stop hook needed)
3. Task tool returns results when each agent finishes
4. Workers run in parallel, reviewer runs after workers complete

---

## Troubleshooting

### If background script execution fails:
1. Check that `claude` CLI is installed and in PATH
2. Verify `.workflow-adapter/agents/` has agent files
3. Check script permissions: `chmod +x scripts/*.sh`

### To cancel running background agents:
```
/workflow-adapter:cancel-agent --all
```

### If a background agent is stuck:
1. Check the agent's state file: `.claude/workflow-agent-{name}.local.md`
2. Check the iteration count - may have hit max_iterations
3. Cancel and restart: `/workflow-adapter:cancel-agent {name}` then run execute again

## Notes
- **Background mode**: Uses Stop hook for iteration, true parallel execution (multiple Claude sessions). State files in `.claude/workflow-agent-*.local.md` control the loop.
- **In-session mode**: Uses Task tool subagents, parallel workers within current session. No state files needed.
- Agents communicate via `.workflow-adapter/doc/feature_{feature_name}/messages/`
