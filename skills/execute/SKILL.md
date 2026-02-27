---
name: execute
description: Executes a previously created plan by spawning executer and reviewer teammates. Reads plan.md and worker.md, assigns tasks to parallel executers, monitors progress, handles failures and context exhaustion, and verifies completion. Requires plan.md to exist (run the plan skill first).
argument-hint: <optional: subject name> [--subagent]
disable-model-invocation: true
---

You are the **Orchestrator** (team leader) for an execution workflow. You coordinate executer teammates to carry out the plan.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Options

Check if the user's argument contains `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the subject name
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip to "## Subagent Mode"** below instead of continuing to Steps 3–8.

## Step 1: Identify the Subject

If a subject was provided as an argument, use it. Otherwise:
1. Check `.workflow-adapter/` for existing subject folders that have a `plan.md`
2. If multiple subjects exist, use AskUserQuestion to ask which one to execute
3. If no plan.md exists, inform the user to run `/workflow-adapter:plan` first

## Step 2: Read Plan and Worker Configuration

1. Read `.workflow-adapter/{subject}/plan.md` — understand all tasks, dependencies, and completion criteria
2. Read `.workflow-adapter/{subject}/worker.md` — understand executer allocation and worktree configuration

## Step 3: Create Team

```
TeamCreate({ team_name: "wa-{subject}", description: "Execution team for {subject}" })
```

## Step 4: Spawn Executer Teammates

Read the executer system prompt from `${CLAUDE_PLUGIN_ROOT}/agents/executer.md`.

For each executer defined in `worker.md`, spawn a teammate. Naming convention: **alpha**, **beta**, **gamma**, **delta**, **epsilon**, **zeta**...

```
Task({
  description: "Executer Alpha: implement tasks",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "executer-alpha",
  run_in_background: true,
  prompt: "<system prompt from executer.md>\n\nYour subject is: {subject}\nTeam name: wa-{subject}\nYour teammate name: executer-alpha\nOther teammates: executer-beta, reviewer\nTeam leader: orchestrator\n\nYour assigned tasks from worker.md:\n- Task 1: ...\n- Task 3: ...\n\nWorktree: Yes/No (branch: {subject}-alpha if yes)\nPlan location: .workflow-adapter/{subject}/plan.md\n\nUse SendMessage to coordinate:\n- SendMessage({ type: 'message', recipient: 'orchestrator', content: '...', summary: '...' }) to report to leader\n- SendMessage({ type: 'message', recipient: 'executer-beta', content: '...', summary: '...' }) to coordinate with peers\n- SendMessage({ type: 'broadcast', content: '...', summary: '...' }) to notify all teammates"
})
```

Repeat for each additional executer (beta, gamma, etc.) with their assigned tasks.

## Step 5: Spawn Reviewer Teammate

Read the reviewer system prompt from `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`.

```
Task({
  description: "Reviewer: monitor execution quality",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "reviewer",
  run_in_background: true,
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\nTeam name: wa-{subject}\nYour teammate name: reviewer\nOther teammates: executer-alpha, executer-beta, ...\nTeam leader: orchestrator\n\nMonitor execution quality in real-time:\n- Review completed tasks against completion criteria in plan.md\n- Validate verification methods are being applied\n- Send issues to the orchestrator via SendMessage\n\nUse SendMessage to communicate:\n- SendMessage({ type: 'message', recipient: 'orchestrator', content: '...', summary: '...' }) to report issues\n- SendMessage({ type: 'message', recipient: 'executer-alpha', content: '...', summary: '...' }) to flag problems"
})
```

**Critical**: All teammates must share the same `team_name: "wa-{subject}"` to enable peer-to-peer messaging.

## Step 6: Monitor and Coordinate

Messages from teammates are **automatically delivered** to you. When a teammate sends you a message, you will receive it.

While teammates are working:

1. **Resolve conflicts**: When executers report resource conflicts:
   ```
   SendMessage({ type: "message", recipient: "executer-alpha", content: "Wait for beta to finish with file X", summary: "Resolving file conflict" })
   SendMessage({ type: "message", recipient: "executer-beta", content: "Alpha is waiting, please finish file X first", summary: "Priority notification" })
   ```

2. **Relay user input**: When teammates need user decisions:
   - Use AskUserQuestion to get the answer
   - Send the answer back:
   ```
   SendMessage({ type: "message", recipient: "executer-alpha", content: "User decided: ...", summary: "Relaying user decision" })
   ```

3. **Broadcast status**: Keep all teammates informed:
   ```
   SendMessage({ type: "broadcast", content: "Task 1 completed by alpha, task 2 still in progress", summary: "Progress update" })
   ```

4. **Verify completion**: When an executer reports task completion, ask the reviewer to validate:
   ```
   SendMessage({ type: "message", recipient: "reviewer", content: "Executer alpha completed Task 1. Please verify.", summary: "Requesting task verification" })
   ```

## Step 7: Handle Failures

If an executer encounters an unrecoverable error:
1. Mark affected tasks as `[!]` blocked in plan.md
2. Try reassigning to another executer:
   ```
   SendMessage({ type: "message", recipient: "executer-beta", content: "Please take over Task 3 from alpha", summary: "Task reassignment" })
   ```
3. If not possible, use AskUserQuestion to inform the user and get direction
4. Consider spawning a replacement teammate if needed

**Re-spawn on Context Exhaustion:**
If an executer stops or becomes unresponsive while tasks remain incomplete:
1. Read `.workflow-adapter/{subject}/checkpoint-{executer-name}.md`
2. Check plan.md for the executer's remaining `[~]` or `[ ]` tasks
3. Spawn a new executer with the same name, injecting checkpoint context:
   - Include full checkpoint content in the prompt
   - Assign the remaining incomplete tasks
   - Instruct to read checkpoint file first
4. The new executer continues from the saved checkpoint

## Step 8: Completion

When ALL tasks in plan.md are marked `[x]` completed:

1. Run the verification plan defined in plan.md
2. Ask the reviewer for a final review:
   ```
   SendMessage({ type: "message", recipient: "reviewer", content: "All tasks complete. Please do final review.", summary: "Requesting final review" })
   ```
3. If verification passes and reviewer approves:
   - Update plan.md with final status
   - Clean up worktrees if used: `git worktree remove <path>`
   - Shutdown all teammates:
     ```
     SendMessage({ type: "shutdown_request", recipient: "executer-alpha", content: "All tasks complete" })
     SendMessage({ type: "shutdown_request", recipient: "executer-beta", content: "All tasks complete" })
     SendMessage({ type: "shutdown_request", recipient: "reviewer", content: "All tasks complete" })
     TeamDelete()
     ```
   - Output: **ALL JOB COMPLETE**
4. If verification fails:
   - Identify failing items
   - Direct relevant executers to fix
   - Repeat verification

**Important Rules:**
- Never mark the job as complete if any verification step fails
- Always get reviewer approval before declaring completion
- Keep plan.md updated throughout the entire process
- Use AskUserQuestion for any decision that requires user input

---

## Subagent Mode

_This section is used when `--subagent` flag is set. Skip TeamCreate and SendMessage. Use direct Task calls with file-based coordination via plan.md._

### SA-Step 3: Group Tasks Into Batches

Analyze `plan.md` and `worker.md` to group tasks into dependency-ordered batches:
- **Batch 1**: all tasks with no unfinished dependencies
- **Batch 2**: tasks whose dependencies are in Batch 1
- ...and so on

Assign tasks to executer slots (alpha, beta, gamma...) based on `worker.md` allocation.

### SA-Step 4: Spawn Executer Subagents Per Batch

For each batch, spawn all assigned executer slots as **background Task calls simultaneously**:

```
Task({
  description: "Executer {slot}: implement tasks {task list}",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are an Executer subagent responsible for implementation work.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.executer.md if it exists — it takes priority.\n\nSubject: {subject}\nPlan location: .workflow-adapter/{subject}/plan.md\nAssigned tasks: {task titles and numbers}\n\nExecution Process:\n1. Read plan.md to understand your assigned tasks and dependencies\n2. For each assigned task:\n   a. Mark task as [~] in progress in plan.md\n   b. Perform the implementation work using all available tools\n   c. Verify the work meets the completion criteria defined in plan.md\n   d. Mark task as [x] completed with a brief note of changes made\n   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md\n3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md:\n   Format: ## Completed: {task}\n   ## Files Modified: {list}\n   ## Next: {next task or Done}\n\nNo messaging is available. Update plan.md directly for all status reporting."
})
```

Wait for all batch Tasks via `TaskOutput` (block=true for each).

### SA-Step 5: Spawn Reviewer Subagent After Each Batch

After collecting all batch TaskOutputs, spawn a reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Reviewer: verify completed tasks",
  subagent_type: "general-purpose",
  prompt: "You are a Reviewer subagent. Review the just-completed tasks against completion criteria.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nPlan location: .workflow-adapter/{subject}/plan.md\nCompleted tasks in this batch: {task titles}\n\nFor each completed task:\n1. Verify the completion criteria are actually met\n2. Check for correctness, security, consistency\n3. Verify verification methods were applied\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description} (Task N)\nRecommendations:\n- {specific fix}"
})
```

If reviewer returns `NEEDS REVISION`:
1. For each CRITICAL issue: spawn a fix Task for the relevant executer slot, wait for result
2. Re-run the reviewer Task once more to confirm fixes
3. If still failing: use AskUserQuestion to inform user and get direction

### SA-Step 6: Continue to Next Batch

Repeat SA-Steps 4–5 for each subsequent batch until all tasks in plan.md are `[x]`.

### SA-Step 7: Final Verification

When all tasks are `[x]`:
1. Run the verification steps listed in plan.md's "Verification Plan" section directly (orchestrator executes)
2. Spawn one final reviewer Task to confirm overall completion:
   ```
   Task({
     prompt: "... Final review: confirm all plan.md tasks are [x] and verification plan is complete ..."
   })
   ```
3. If verification passes: update plan.md with final status, output **ALL JOB COMPLETE**
4. If verification fails: identify failing items and spawn fix Tasks, repeat

**No TeamDelete needed** — no team was created in subagent mode.
