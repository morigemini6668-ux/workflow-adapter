---
name: execute
description: Executes a previously created plan by spawning executer and reviewer teammates. Reads plan.md and worker.md, assigns tasks to parallel executers, monitors progress, handles failures and context exhaustion, and verifies completion. Requires plan.md to exist (run the plan skill first).
argument-hint: "<optional: subject name> [--subagent] [--copilot] [--codex]"
---

You are the **Orchestrator** (team leader) for an execution workflow. You coordinate executer teammates to carry out the plan.

**Worktree Safety — MANDATORY:**
- Use `EnterWorktree`/`ExitWorktree` tools for all worktree operations. **NEVER use raw `git worktree add/remove` commands.**
- `ExitWorktree({ action: "remove" })` will automatically refuse if there are uncommitted changes — this is the safety net.
- **NEVER call `ExitWorktree({ action: "remove" })` automatically.** Only the user may decide to remove a worktree. After completion, call `ExitWorktree({ action: "keep" })` and report the branch name so the user can clean up later.
- **NEVER pass `discard_changes: true`** unless the user explicitly asks to discard.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

**Backlog Check:**
Check if `.workflow-adapter/backlog/` exists and contains `.md` files with `status: pending` in their frontmatter. If pending items exist, briefly list them to the user and ask:
```
AskUserQuestion({
  questions: [{
    question: "There are pending backlog items:\n\n{list of pending items with type and priority}\n\nWould you like to address any of these during execution?",
    header: "Backlog",
    options: [
      { label: "Yes", description: "I'll incorporate some backlog items into this execution" },
      { label: "No", description: "Proceed without addressing backlog items" }
    ],
    multiSelect: false
  }]
})
```
If yes, ask which items to include and add them as additional tasks in plan.md. If no or if the backlog directory is empty/missing, proceed normally.

## Step 0: Parse Options

Check if the user's argument contains these flags:
- `--subagent`: set `subagent_mode = true`, remove from subject name
- `--copilot`: set `copilot_mode = true`, remove from subject name
- `--codex`: set `codex_mode = true`, remove from subject name
- If `--copilot` is present, `copilot_mode = true`
- If `--codex` is present, `codex_mode = true`
- If none of `--subagent`, `--copilot`, `--codex` is present, all are `false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–8 entirely and proceed directly to SA-Step 3 in the "## Subagent Mode" section** below.

When `copilot_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–8 and SA-Steps entirely and proceed directly to CP-Step 3 in the "## Copilot Mode" section** below.

When `codex_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–8, SA-Steps, and CP-Steps entirely and proceed directly to CX-Step 3 in the "## Codex Mode" section** below.

## Step 1: Identify the Subject

If a subject was provided as an argument, use it. Otherwise:
1. Check `.workflow-adapter/` for existing subject folders that have a `plan.md`
2. If multiple subjects exist, use AskUserQuestion to ask which one to execute
3. If no plan.md exists, inform the user to run `/workflow-adapter:plan` first

## Step 2: Read Plan and Worker Configuration

1. Read `.workflow-adapter/{subject}/plan.md` — understand all tasks, dependencies, and completion criteria
2. Read `.workflow-adapter/{subject}/worker.md` — understand executer allocation and worktree configuration

## Step 2.5: Create Worktree (if configured)

If `worker.md` specifies `Worktree: Yes`:

```
REPO_ROOT=$(git rev-parse --show-toplevel)   # save before entering worktree
EnterWorktree({ name: "{subject}" })
```

The tool creates a worktree under `.claude/worktrees/{subject}` and switches the session directory into it automatically. Store `REPO_ROOT` (the original repo path) for accessing `.workflow-adapter/` files.

If worktree is No, store `REPO_ROOT` only (run `REPO_ROOT=$(git rev-parse --show-toplevel)`).

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
  prompt: "<system prompt from executer.md>\n\nYour subject is: {subject}\nTeam name: wa-{subject}\nYour teammate name: executer-alpha\nOther teammates: executer-beta, reviewer\nTeam leader: orchestrator\n\nYour assigned tasks from worker.md:\n- Task 1: ...\n- Task 3: ...\n\nWorktree: Yes/No\n{If worktree: Code changes directory: {WORKTREE_PATH} — perform all code edits inside this directory. Do NOT create or remove worktrees yourself.}\nMain repo: {REPO_ROOT}\nPlan location: {REPO_ROOT}/.workflow-adapter/{subject}/plan.md\nCheckpoint location: {REPO_ROOT}/.workflow-adapter/{subject}/checkpoint-{name}.md\n\nUse SendMessage to coordinate:\n- SendMessage({ to: 'orchestrator', message: '...', summary: '...' }) to report to leader\n- SendMessage({ to: 'executer-beta', message: '...', summary: '...' }) to coordinate with peers\n- SendMessage({ to: '*', message: '...', summary: '...' }) to notify all teammates"
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
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\nTeam name: wa-{subject}\nYour teammate name: reviewer\nOther teammates: executer-alpha, executer-beta, ...\nTeam leader: orchestrator\n\nMonitor execution quality in real-time:\n- Review completed tasks against completion criteria in plan.md\n- Validate verification methods are being applied\n- Send issues to the orchestrator via SendMessage\n\nUse SendMessage to communicate:\n- SendMessage({ to: 'orchestrator', message: '...', summary: '...' }) to report issues\n- SendMessage({ to: 'executer-alpha', message: '...', summary: '...' }) to flag problems"
})
```

**Critical**: All teammates must share the same `team_name: "wa-{subject}"` to enable peer-to-peer messaging.

## Step 6: Monitor and Coordinate

Messages from teammates are **automatically delivered** to you. When a teammate sends you a message, you will receive it.

While teammates are working:

1. **Resolve conflicts**: When executers report resource conflicts:
   ```
   SendMessage({ to: "executer-alpha", message: "Wait for beta to finish with file X", summary: "Resolving file conflict" })
   SendMessage({ to: "executer-beta", message: "Alpha is waiting, please finish file X first", summary: "Priority notification" })
   ```

2. **Relay user input**: When teammates need user decisions:
   - Use AskUserQuestion to get the answer
   - Send the answer back:
   ```
   SendMessage({ to: "executer-alpha", message: "User decided: ...", summary: "Relaying user decision" })
   ```

3. **Broadcast status**: Keep all teammates informed:
   ```
   SendMessage({ to: "*", message: "Task 1 completed by alpha, task 2 still in progress", summary: "Progress update" })
   ```

4. **Verify completion**: When an executer reports task completion, ask the reviewer to validate:
   ```
   SendMessage({ to: "reviewer", message: "Executer alpha completed Task 1. Please verify.", summary: "Requesting task verification" })
   ```

## Step 7: Handle Failures

If an executer encounters an unrecoverable error:
1. Mark affected tasks as `[!]` blocked in plan.md
2. Try reassigning to another executer:
   ```
   SendMessage({ to: "executer-beta", message: "Please take over Task 3 from alpha", summary: "Task reassignment" })
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
   SendMessage({ to: "reviewer", message: "All tasks complete. Please do final review.", summary: "Requesting final review" })
   ```
3. If verification passes and reviewer approves:
   - Update plan.md with final status
   - **Commit worktree changes** (if worktree was used):
     ```bash
     git add -A && git status && git commit -m "{subject}: execution complete"
     ```
   - Shutdown all teammates:
     ```
     SendMessage({ to: "executer-alpha", message: { type: "shutdown_request", reason: "All tasks complete" } })
     SendMessage({ to: "executer-beta", message: { type: "shutdown_request", reason: "All tasks complete" } })
     SendMessage({ to: "reviewer", message: { type: "shutdown_request", reason: "All tasks complete" } })
     ```
     Wait for all teammates to confirm shutdown (shutdown_approved messages) before calling TeamDelete().
     ```
     TeamDelete()
     ```
   - **Exit worktree with `keep`** (do NOT remove — let the user decide):
     ```
     ExitWorktree({ action: "keep" })
     ```
   - Report to user:
     - If worktree was used:
       ```
       ALL JOB COMPLETE

       Changes are on branch: {subject}
         -> Review:  git log {subject}
         -> Merge:   git merge {subject}
         -> Discard: git branch -D {subject}

       Suggested follow-ups:
         -> /retrospective to extract principles and lessons learned
         -> /archive to preserve decisions as ADRs
         -> /session-insights to analyze usage patterns
       ```
     - If no worktree:
       ```
       ALL JOB COMPLETE

       Changes were applied directly to the current branch.

       Suggested follow-ups:
         -> /retrospective to extract principles and lessons learned
         -> /archive to preserve decisions as ADRs
         -> /session-insights to analyze usage patterns
       ```
4. If verification fails:
   - Identify failing items
   - Direct relevant executers to fix
   - Repeat verification

**Important Rules:**
- Never mark the job as complete if any verification step fails
- Always get reviewer approval before declaring completion
- Keep plan.md updated throughout the entire process
- Use AskUserQuestion for any decision that requires user input

**Backlog Offer:**
After execution completes, ask the user if any deferred items should be added to the backlog:
```
AskUserQuestion({
  questions: [{
    question: "Were there any follow-up tasks, improvements, or deferred work from this execution that should be added to the backlog for later?",
    header: "Backlog",
    options: [
      { label: "Yes", description: "I have items to add to the backlog" },
      { label: "No", description: "Nothing to defer" }
    ],
    multiSelect: false
  }]
})
```
If yes, collect each item's type (task / principle-change / environment-change), priority, and description, then create backlog files in `.workflow-adapter/backlog/` with `source: {subject}` and `status: pending`.

---

## Subagent Mode

_This section is used when `--subagent` flag is set. Skip TeamCreate and SendMessage. Use direct Task calls with file-based coordination via plan.md._

### SA-Step 2.5: Create Worktree (if configured)

Same as Step 2.5 above — use `EnterWorktree({ name: "{subject}" })`. Store `REPO_ROOT` for passing to all executer subagents.

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
  prompt: "You are an Executer subagent responsible for implementation work.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.executer.md if it exists — it takes priority.\n\nSubject: {subject}\nMain repo: {REPO_ROOT}\nPlan location: {REPO_ROOT}/.workflow-adapter/{subject}/plan.md\nAssigned tasks: {task titles and numbers}\n{If worktree: Code changes directory: {WORKTREE_PATH} — perform all code edits inside this directory. Do NOT create or remove worktrees yourself.\nCheckpoint location: {REPO_ROOT}/.workflow-adapter/{subject}/checkpoint-{slot}.md}\n\nExecution Process:\n1. Read plan.md to understand your assigned tasks and dependencies\n2. For each assigned task:\n   a. Mark task as [~] in progress in plan.md\n   b. Perform the implementation work using all available tools\n   c. Verify the work meets the completion criteria defined in plan.md\n   d. Mark task as [x] completed with a brief note of changes made\n   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md\n3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md:\n   Format: ## Completed: {task}\n   ## Files Modified: {list}\n   ## Next: {next task or Done}\n\nNo messaging is available. Update plan.md directly for all status reporting. Write only to your own assigned task rows — do not overwrite other tasks' status lines."
})
```

Wait for all batch Tasks using the `TaskOutput` tool (set `block=true` for each task_id) — this blocks until the Task result is returned.

### SA-Step 5: Spawn Reviewer Subagent After Each Batch

After collecting all batch TaskOutputs, spawn a reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Reviewer: verify completed tasks",
  run_in_background: false,
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
     description: "Reviewer: final verification",
     subagent_type: "general-purpose",
     run_in_background: false,
     prompt: "You are a Reviewer subagent performing a final verification.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nPlan location: .workflow-adapter/{subject}/plan.md\n\nVerify:\n1. All tasks in plan.md are marked [x] completed\n2. All verification steps in the Verification Plan section are checked off\n3. No tasks are marked [!] blocked or [~] in progress\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description} (Task N)\nRecommendations:\n- {specific fix}"
   })
   ```
3. If verification passes:
   - Update plan.md with final status
   - **Commit worktree changes** (if worktree was used):
     ```bash
     git add -A && git status && git commit -m "{subject}: execution complete"
     ```
   - Exit worktree: `ExitWorktree({ action: "keep" })`
   - Report to user (same format as Step 8 — show branch name)
   - Output **ALL JOB COMPLETE**
4. If verification fails: identify failing items and spawn fix Tasks, repeat

**No TeamDelete needed** — no team was created in subagent mode.

---

## Copilot Mode

_This section is used when `--copilot` flag is set. All Analyzer, Executor, and Reviewer roles are delegated to Copilot CLI via `copilot-exec.ts`. The orchestrator (Claude) manages batching, progress tracking, and completion decisions._

### CP-Step 2.5: Create Worktree (if configured)

Same as Step 2.5 above — use `EnterWorktree({ name: "{subject}" })`. Store `REPO_ROOT` for passing to all Copilot executer subagents.

### CP-Step 3: Group Tasks Into Batches

Same as SA-Step 3 — analyze `plan.md` and `worker.md` to group tasks into dependency-ordered batches:
- **Batch 1**: all tasks with no unfinished dependencies
- **Batch 2**: tasks whose dependencies are in Batch 1
- ...and so on

Assign tasks to executer slots (alpha, beta, gamma...) based on `worker.md` allocation.

### CP-Step 4: Spawn Copilot Executer Subagents Per Batch

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn subagents for each executer slot. Do NOT run the steps inside the prompt yourself. The entire content below is each subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

For each batch, spawn all assigned executer slots as **background Task calls simultaneously**:

```
Task({
  description: "Copilot executer {slot}: implement tasks",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run copilot-exec.ts via Bash, (3) report the result.

Subject: {subject}
Executer slot: {slot}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-{slot}.md with this exact content:

You are an Executer responsible for implementation work.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Subject: {subject}
Plan location: .workflow-adapter/{subject}/plan.md
Assigned tasks: {task numbers and titles — pending only}

Execution Process:
1. Read plan.md to understand your assigned tasks and dependencies
2. For each assigned task:
   a. Mark task as [~] in progress in plan.md
   b. Perform the implementation work
   c. Verify the work meets the completion criteria defined in plan.md
   d. Mark task as [x] completed with a brief note of changes made
   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md
3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md

Write only to your own assigned task rows — do not overwrite other tasks' status lines.

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '.workflow-adapter/{subject}/prompt-{slot}.md'

3. Check the exit code. If non-zero, report the error.
4. Read plan.md and verify the assigned tasks were updated.
Output ONLY: Copilot executer {slot}: {completed}/{total} tasks done.
</copilot-dispatcher-prompt>"
})
```

Wait for all batch Tasks using the `TaskOutput` tool (set `block=true` for each task_id).

### CP-Step 5: Spawn Copilot Reviewer After Each Batch

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run the steps inside the prompt yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

After collecting all batch TaskOutputs, spawn a reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Copilot reviewer: verify completed tasks",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run copilot-exec.ts via Bash, (3) report the result.

Subject: {subject}
Completed tasks in this batch: {task titles}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-reviewer.md with this exact content:

You are a Reviewer. Review the just-completed tasks against completion criteria.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.
Also read .workflow-adapter/principle.reviewer.md if it exists (takes priority).

Plan location: .workflow-adapter/{subject}/plan.md
Completed tasks in this batch: {task titles}

For each completed task:
1. Verify the completion criteria are actually met
2. Check for correctness, security, consistency
3. Verify verification methods were applied

Write your review to .workflow-adapter/{subject}/review-batch-{N}.md in this format:
Status: PASS or NEEDS REVISION
Issues:
- [CRITICAL|WARNING] {description} (Task N)
Recommendations:
- {specific fix}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '.workflow-adapter/{subject}/prompt-reviewer.md'

3. Read .workflow-adapter/{subject}/review-batch-{N}.md and extract the Status line.
Output ONLY: Status: PASS or Status: NEEDS REVISION — {summary}
</copilot-dispatcher-prompt>"
})
```

If reviewer returns `NEEDS REVISION`:
1. For each CRITICAL issue: spawn a fix Task (same Copilot pattern), wait for result
2. Re-run the reviewer Task once more to confirm fixes
3. If still failing after 2 retry cycles: use AskUserQuestion to inform user and get direction

### CP-Step 6: Continue to Next Batch

Repeat CP-Steps 4–5 for each subsequent batch until all tasks in plan.md are `[x]`.

### CP-Step 7: Final Verification

When all tasks are `[x]`:
1. Run the verification steps listed in plan.md's "Verification Plan" section directly (orchestrator executes)
2. Spawn one final Copilot reviewer Task (same pattern as CP-Step 5) to confirm overall completion
3. If verification passes: update plan.md with final status, clean up prompt-*.md files, **commit worktree changes** if worktree was used (`git add -A && git commit -m "{subject}: execution complete"`), exit worktree with `ExitWorktree({ action: "keep" })`, report branch info to user (same format as Step 8), output **ALL JOB COMPLETE**
4. If verification fails: identify failing items and spawn fix Tasks, repeat

---

## Codex Mode

_This section is used when `--codex` flag is set. All Executer and Reviewer roles are delegated to Codex CLI via `codex-client.ts`. The orchestrator (Claude) manages batching, progress tracking, and completion decisions._

### CX-Step 2.5: Create Worktree (if configured)

Same as Step 2.5 above — use `EnterWorktree({ name: "{subject}" })`. Store `REPO_ROOT` for passing to all Codex executer subagents.

### CX-Step 3: Group Tasks Into Batches

Same as SA-Step 3 — analyze `plan.md` and `worker.md` to group tasks into dependency-ordered batches:
- **Batch 1**: all tasks with no unfinished dependencies
- **Batch 2**: tasks whose dependencies are in Batch 1
- ...and so on

Assign tasks to executer slots (alpha, beta, gamma...) based on `worker.md` allocation.

### CX-Step 4: Spawn Codex Executer Subagents Per Batch

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn subagents for each executer slot. Do NOT run the steps inside the prompt yourself. The entire content below is each subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

For each batch, spawn all assigned executer slots as **background Task calls simultaneously**:

```
Task({
  description: "Codex executer {slot}: implement tasks",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<codex-dispatcher-prompt>
You are a Codex dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run codex-client.ts via Bash, (3) report the result.

Subject: {subject}
Executer slot: {slot}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-{slot}.md with this exact content:

You are an Executer responsible for implementation work.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Subject: {subject}
Plan location: .workflow-adapter/{subject}/plan.md
Assigned tasks: {task numbers and titles — pending only}

Execution Process:
1. Read plan.md to understand your assigned tasks and dependencies
2. For each assigned task:
   a. Mark task as [~] in progress in plan.md
   b. Perform the implementation work
   c. Verify the work meets the completion criteria defined in plan.md
   d. Mark task as [x] completed with a brief note of changes made
   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md
3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md

Write only to your own assigned task rows — do not overwrite other tasks' status lines.

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts' --writable --prompt-file '.workflow-adapter/{subject}/prompt-{slot}.md'

3. Check the exit code. If non-zero, report the error.
4. Read plan.md and verify the assigned tasks were updated.
Output ONLY: Codex executer {slot}: {completed}/{total} tasks done.
</codex-dispatcher-prompt>"
})
```

Wait for all batch Tasks using the `TaskOutput` tool (set `block=true` for each task_id).

### CX-Step 5: Spawn Codex Reviewer After Each Batch

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run the steps inside the prompt yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

After collecting all batch TaskOutputs, spawn a reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Codex reviewer: verify completed tasks",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<codex-dispatcher-prompt>
You are a Codex dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run codex-client.ts via Bash, (3) report the result.

Subject: {subject}
Completed tasks in this batch: {task titles}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-reviewer.md with this exact content:

You are a Reviewer. Review the just-completed tasks against completion criteria.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.
Also read .workflow-adapter/principle.reviewer.md if it exists (takes priority).

Plan location: .workflow-adapter/{subject}/plan.md
Completed tasks in this batch: {task titles}

For each completed task:
1. Verify the completion criteria are actually met
2. Check for correctness, security, consistency
3. Verify verification methods were applied

Write your review to .workflow-adapter/{subject}/review-batch-{N}.md in this format:
Status: PASS or NEEDS REVISION
Issues:
- [CRITICAL|WARNING] {description} (Task N)
Recommendations:
- {specific fix}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts' --writable --prompt-file '.workflow-adapter/{subject}/prompt-reviewer.md'

3. Read .workflow-adapter/{subject}/review-batch-{N}.md and extract the Status line.
Output ONLY: Status: PASS or Status: NEEDS REVISION — {summary}
</codex-dispatcher-prompt>"
})
```

If reviewer returns `NEEDS REVISION`:
1. For each CRITICAL issue: spawn a fix Task (same Codex dispatcher pattern), wait for result
2. Re-run the reviewer Task once more to confirm fixes
3. If still failing after 2 retry cycles: use AskUserQuestion to inform user and get direction

### CX-Step 6: Continue to Next Batch

Repeat CX-Steps 4–5 for each subsequent batch until all tasks in plan.md are `[x]`.

### CX-Step 7: Final Verification

When all tasks are `[x]`:
1. Run the verification steps listed in plan.md's "Verification Plan" section directly (orchestrator executes)
2. Spawn one final Codex reviewer Task (same pattern as CX-Step 5) to confirm overall completion
3. If verification passes: update plan.md with final status, clean up prompt-*.md files, **commit worktree changes** if worktree was used (`git add -A && git commit -m "{subject}: execution complete"`), exit worktree with `ExitWorktree({ action: "keep" })`, report branch info to user (same format as Step 8), output **ALL JOB COMPLETE**
4. If verification fails: identify failing items and spawn fix Tasks, repeat
