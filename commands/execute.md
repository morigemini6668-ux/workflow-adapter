---
description: Execute all agents using teammate coordination
argument-hint: <name> [--in-session] [--max-iter N] [--complete] [--fix]
allowed-tools: [Read, Write, Glob, Task, Teammate, SendMessage, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

Execute all workflow agents for a specific feature or fix. Uses Teammate coordination for multi-agent execution.

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

### 0. Resolve Agents Directory Path
Determine the agents directory by checking which path exists with agent files:

1. Check `.claude/agents/.local/workflow-adapter/` - if exists and contains `.md` files, use this path
2. Otherwise, use `.claude/agents/workflow-adapter/`

Store this as `AGENTS_DIR` for use in subsequent steps.

### 1. Validate Feature Name
If no feature name provided, show error:
```
Error: Feature name required.
Usage: /workflow-adapter:execute <feature-name> [--in-session] [--max-iter N]

Available features:
{list features from .workflow-adapter/doc/feature_*/}
```

### 2. Validate Setup
Check that `AGENTS_DIR` (resolved in step 0) exists and contains agent files.
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

Determine mode: If `--in-session` → Mode B (In-Session), else → Default (Teammate).

---

## Default Mode: Teammate Execution

Uses Claude Code built-in Teammate feature for coordinated multi-agent execution. The main session acts as the team leader (orchestrator).

### Step C1: Parse plan.md Tasks
Read `.workflow-adapter/doc/feature_$1/plan.md` and extract:
- All tasks: ID, description, assignee, dependencies, status
- Filter out tasks with status DONE
- Group remaining tasks by assignee

### Step C2: Spawn Team
```
Teammate.spawnTeam("wa-exec-{name}", "Execute: {name}")
```

### Step C3: Create Tasks via TaskCreate
For each task from plan.md that is NOT DONE:
- Use `TaskCreate` with:
  - subject: "{task_id}: {brief description}"
  - description: Full task description including acceptance criteria from plan.md
  - activeForm: "Working on {task_id}"
- After creating all tasks, set up dependencies:
  - Use `TaskUpdate.addBlockedBy` to mirror plan.md dependencies
  - Only reference tasks that are not already DONE

### Step C4: Spawn Worker Teammates
For each worker agent that has assigned tasks, use `Task` tool:
```yaml
team_name: "wa-exec-{name}"
name: "{agent_name}"
subagent_type: "workflow-adapter:{agent_name}"
mode: "bypassPermissions"
prompt: |
  You are {agent_name}, a worker agent operating in teammate mode.

  ## Feature: {feature_name}

  ## How to Work
  1. Read .workflow-adapter/doc/principle.md for guidelines
  2. Read .workflow-adapter/doc/feature_{feature_name}/context.md for project context
  3. Use TaskList to find tasks assigned to you (owner: {agent_name})
  4. For each task:
     - Use TaskUpdate to mark it as in_progress
     - Implement the task
     - Update plan.md task status (TODO -> IN_PROGRESS -> DONE)
     - Use TaskUpdate to mark it as completed
  5. If blocked, send a message to the team lead via SendMessage
  6. After completing all your tasks, send a summary via SendMessage to the team lead

  ## Agent Guidance
  Read your guidance in .workflow-adapter/doc/feature_{feature_name}/plan.md
  under the "Agent Guidance" section for {agent_name}.

  Start working now.
```

**Spawn all workers in parallel** (multiple Task calls in a single message).

### Step C5: Spawn Reviewer + Advocate
Spawn reviewer teammate (will wait for tasks to be assigned):
```yaml
team_name: "wa-exec-{name}"
name: "reviewer"
subagent_type: "workflow-adapter:reviewer"
mode: "bypassPermissions"
prompt: |
  You are the reviewer agent operating in teammate mode.

  ## Feature: {feature_name}

  ## How to Work
  1. Wait for review tasks to be assigned to you via TaskList
  2. When a task is assigned, review the implementation
  3. Check against spec: .workflow-adapter/doc/feature_{feature_name}/spec.md
  4. Send review results to the team lead via SendMessage
  5. Mark tasks as completed via TaskUpdate

  Wait for task assignment.
```

If advocate agent is installed (check agents directory for `advocate.md`), also spawn:
```yaml
team_name: "wa-exec-{name}"
name: "advocate"
subagent_type: "workflow-adapter:advocate"
mode: "bypassPermissions"
prompt: |
  You are the advocate (Devil's Advocate) operating in teammate mode.

  ## Feature: {feature_name}

  ## How to Work
  1. Wait for review tasks to be assigned to you via TaskList
  2. When assigned, critically review implementations
  3. Focus on security, performance, edge cases, and failure scenarios
  4. Send critical feedback to the team lead via SendMessage
  5. If you identify issues, suggest specific fixes
  6. Mark tasks as completed via TaskUpdate

  Wait for task assignment.
```

### Step C6: Initial Task Assignment
For each TaskCreate'd task that has NO blockedBy dependencies:
- Use `TaskUpdate(owner: "{agent_name}")` to assign to the appropriate worker
- Send `SendMessage` to that worker: "Task #{id} assigned to you: {description}"

### Step C7: Orchestration Loop (Main Process)
The main session (team leader) orchestrates the execution:

**Loop until all tasks are completed:**

1. **Receive teammate messages** (automatic delivery)
   - When a worker reports task completion:
     a. Verify task is marked completed in TaskList
     b. Check if any blocked tasks are now unblocked
     c. Assign newly unblocked tasks to their designated agents via TaskUpdate + SendMessage
     d. Update plan.md task status to match

2. **Handle advocate feedback** (if advocate is active):
   - If advocate identifies critical issues during implementation:
     a. Forward feedback to the relevant worker via SendMessage
     b. Or create a new fix task via TaskCreate and assign it

3. **Check for completion:**
   - Use `TaskList` to check overall progress
   - If all worker tasks are completed:
     a. Create a review task: "Review all implementations for feature: {name}"
     b. Assign to "reviewer" via TaskUpdate
     c. If advocate is present, create a parallel critical review task and assign to "advocate"

4. **Process review results:**
   - When reviewer reports back:
     - If APPROVED: proceed to Step C8
     - If NEEDS_CHANGES: Create fix tasks from reviewer feedback, assign to appropriate workers

5. **Handle stuck agents:**
   - If no progress for extended period, send a check-in message
   - If an agent reports being blocked, help resolve or reassign

### Step C8: Completion and Cleanup
1. Verify all tasks are completed via `TaskList`
2. Send `shutdown_request` to each teammate (reviewer, advocate, all workers)
3. Call `Teammate.cleanup()`
4. Synchronize plan.md with final task statuses
5. Show completion message:

```
Teammate execution complete for feature: {feature_name}

Team: wa-exec-{name}
Workers: {worker_list}
Reviewer: {review_status}
{Advocate: {advocate_status}  # if advocate was spawned}

Results:
- Tasks completed: {done}/{total}
- Review status: {APPROVED/NEEDS_CHANGES}

Documents updated:
- Plan: .workflow-adapter/doc/feature_{name}/plan.md
- Messages: .workflow-adapter/doc/feature_{name}/messages/

Run /workflow-adapter:validate {name} to verify completion.
```

---

## Mode B: In-Session Execution (--in-session flag)

**IMPORTANT: Only use this mode when --in-session flag is explicitly provided.**

Run agents as subagents within the current Claude session using Task tool.

### Step 1: Discover Agents
Read all agent files from `AGENTS_DIR` (resolved in step 0):
- List all `.md` files
- Extract agent names (exclude orchestrator and reviewer for parallel execution)
- Sort alphabetically (alpha, beta, gamma...)

### Step 2: Read Agent Instructions and Tasks
For each worker agent:
1. Read agent instructions from `{AGENTS_DIR}/{name}.md`
2. Extract assigned tasks from `.workflow-adapter/doc/feature_{feature_name}/plan.md`

### Step 3: Launch Worker Agents in Parallel via Task Tool
**Use Task tool to launch all worker agents in parallel** (send multiple Task tool calls in a single message).

The agents are installed to `.claude/agents/workflow-adapter/` via `/workflow-adapter:install`, so use the namespaced agent name:
- `subagent_type: "workflow-adapter:alpha"`
- `subagent_type: "workflow-adapter:beta"`
- `subagent_type: "workflow-adapter:gamma"`
- etc.

For each worker agent, call Task tool with:

```yaml
subagent_type: "workflow-adapter:{agent_name}"
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
[Task call 1: subagent_type="workflow-adapter:alpha"]
[Task call 2: subagent_type="workflow-adapter:beta"]
[Task call 3: subagent_type="workflow-adapter:gamma"]
```

### Step 4: Wait for All Agents to Complete
Task tool will return results from each agent. Collect their outputs.

### Step 5: Run Reviewer Agent (if exists)
After all workers complete, launch the reviewer agent:

```yaml
subagent_type: "workflow-adapter:reviewer"
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

### Teammate Mode (Default)
Uses Claude Code built-in Teammate feature:
1. Main session acts as team leader/orchestrator
2. Workers, reviewer, and advocate spawned as teammates
3. Tasks managed via TaskCreate/TaskUpdate/TaskList
4. Inter-agent communication via SendMessage
5. Main session orchestrates task assignment and dependency resolution
6. Reviewer + advocate run after workers complete

### In-Session Mode (--in-session)
Uses Task tool to spawn subagents:
1. Each agent runs as a subagent via Task tool
2. Subagents execute until completion
3. Task tool returns results when each agent finishes
4. Workers run in parallel, reviewer runs after workers complete

---

## Troubleshooting

### If agents are not responding:
1. Check that agent files exist in `AGENTS_DIR`
2. Verify the feature plan has tasks assigned to agents
3. Use `/workflow-adapter:teammate-status` to check team status

### If tasks are stuck:
1. Check `TaskList` for blocked tasks
2. Verify dependencies are correctly set up
3. Send a check-in message to the stuck agent via `SendMessage`

## Notes
- **Teammate mode (default)**: Uses Claude Code Teammate feature. Main session orchestrates. Supports advocate for critical review during execution.
- **In-session mode (--in-session)**: Uses Task tool subagents, parallel workers within current session.
- Check team status: `/workflow-adapter:teammate-status`
