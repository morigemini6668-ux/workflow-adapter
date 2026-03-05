---
name: ralph-execute
description: Runs a Ralph Wiggum-style iterative execution loop. Reads plan.md, spawns one-shot executer subagents, verifies completion, and loops until all tasks complete or max iterations reached.
argument-hint: "<subject> [--max-iterations N] [--copilot] [--copilot-model MODEL]"
disable-model-invocation: true
---

You are the **Ralph-Execute Orchestrator** running an iterative execution loop over a plan.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Arguments

Extract from the skill arguments:
- `subject` (required) — the workflow subject name (e.g., `my-feature`)
- `--max-iterations N` (optional) — maximum loop iterations before giving up; default is `10`
- `--copilot` (optional) — delegate Executer and Reviewer roles to Copilot CLI instead of Claude subagents
- `--copilot-model MODEL` (optional) — model for Copilot CLI; default is `gpt-5.3-codex`

If `--copilot` is present, set `copilot_mode = true` and remove it from the subject name.

If no subject is provided, check `.workflow-adapter/` for exactly one folder with a `plan.md`. If zero or multiple found, use AskUserQuestion to ask the user which subject to run.

## Step 1: Verify Subject

Check that both of the following files exist:
- `.workflow-adapter/{subject}/plan.md`
- `.workflow-adapter/{subject}/worker.md`

If either file is missing:
- Tell the user: "Subject `{subject}` is not set up. Run `/workflow-adapter:plan {subject}` first to create the plan and worker configuration."
- Stop here.

## Step 2: Check State File

Check whether `.workflow-adapter/{subject}/ralph-state.md` exists.

**If it does NOT exist** (first iteration):
- Run the following via Bash tool to create it:
  ```
  bun "${CLAUDE_PLUGIN_ROOT}/scripts/ralph-init-state.ts" {subject} --max-iterations {N}
  ```
  (Replace `{N}` with the parsed `--max-iterations` value, or `10` if not specified.)
- If the script exits with a non-zero code, output its stderr message and stop.
- If `copilot_mode = true`, add `copilot_mode: true` and `copilot_model: "{copilot_model}"` to the frontmatter of the created `ralph-state.md` file using the Edit tool.

**If it DOES exist** (subsequent iteration or leftover):
- Read the state file to obtain the current `iteration` value and `max_iterations`.
- If the frontmatter contains `copilot_mode: true`, set `copilot_mode = true` and read `copilot_model` from frontmatter (preserves mode across re-injections).
- **Edge case — leftover state file**: If plan.md currently has NO pending tasks (`[ ]`, `[~]`, or `[!]`), the state file may be a leftover from a previous run. Use AskUserQuestion to ask: "A `ralph-state.md` already exists for subject `{subject}`. Cancel the old loop first with `/workflow-adapter:ralph-cancel`, or continue with the existing state?" If the user says cancel, stop. If continue, proceed with the existing state.

## Step 3: Identify Pending Tasks

Read `.workflow-adapter/{subject}/plan.md`. Find all tasks with status:
- `[ ]` — pending
- `[~]` — in progress (stalled from a previous iteration)
- `[!]` — blocked (failed previously)

**If NO pending tasks are found** (all tasks are `[x]`):
- Skip directly to Step 7 (Completion Check).

Read the `## Loop State` section of plan.md (if present). Extract failure context from previous iterations — this will be injected into executer prompts in Step 4.

## Step 4: Spawn One-Shot Executer Subagents

Read `.workflow-adapter/{subject}/worker.md` to understand executer allocation (which tasks are assigned to which executer slot: alpha, beta, gamma, etc.).

**If `copilot_mode = false` (default):**

For each executer slot that has pending tasks, spawn a **background one-shot subagent** using the Agent tool:

```
Task({
  description: "Executer {slot}: implement assigned tasks",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are an Executer subagent responsible for implementation work.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.
2. Check .workflow-adapter/principle.executer.md if it exists — it takes priority.

Subject: {subject}
Plan location: .workflow-adapter/{subject}/plan.md
Assigned tasks: {task numbers and titles from worker.md — pending only}

Execution Process:
1. Read plan.md to understand your assigned tasks and dependencies
2. For each assigned task:
   a. Mark task as [~] in progress in plan.md
   b. Perform the implementation work using all available tools
   c. Verify the work meets the completion criteria defined in plan.md
   d. Mark task as [x] completed with a brief note of changes made
   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md
3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md:
   Format:
   ## Completed: {task}
   ## Files Modified: {list}
   ## Next: {next task or Done}

No messaging is available. Update plan.md directly for all status reporting.
Write only to your own assigned task rows — do not overwrite other tasks' status lines.

{failure_context_from_loop_state_section_if_any}

Final output: When all assigned tasks are done, output ONLY this one line:
Executer {slot}: {completed}/{total} tasks done. Details in checkpoint-{slot}.md
Do not output verbose summaries — all details are already in plan.md and checkpoint-{slot}.md."
})
```

**If `copilot_mode = true`:**

For each executer slot that has pending tasks, spawn a **background Task** that writes a prompt file and invokes Copilot CLI:

```
Task({
  description: "Copilot executer {slot}: implement tasks",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Copilot dispatcher. Write a prompt file and run Copilot CLI.

Subject: {subject}
Executer slot: {slot}
Copilot model: {copilot_model}

Step 1: Write the prompt file to .workflow-adapter/{subject}/prompt-{slot}.md using the Write tool:

---
You are an Executer responsible for implementation work.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Subject: {subject}
Plan location: .workflow-adapter/{subject}/plan.md
Assigned tasks: {task numbers and titles — pending only}

{failure_context_from_loop_state_section_if_any}

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
---

Step 2: Run Copilot CLI via Bash:
bash '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.sh' --prompt-file '.workflow-adapter/{subject}/prompt-{slot}.md' --model '{copilot_model}' --timeout 600

Step 3: Check the exit code. If non-zero, report the error.
Step 4: Read plan.md and verify the assigned tasks were updated.
Output ONLY: Copilot executer {slot}: {completed}/{total} tasks done."
})
```

Do **not** include SendMessage instructions — this is one-shot mode, not teammate mode.

Spawn all executer subagents simultaneously (all `run_in_background: true`).

Wait for all subagents to complete using the TaskOutput tool — call it with `block: true` for each task_id returned by the Agent tool calls.

## Step 5: Spawn Reviewer Subagent

After all executer subagents have finished, spawn a reviewer.

**If `copilot_mode = false` (default):**

Spawn a **foreground reviewer** (wait for result):

```
Task({
  description: "Reviewer: verify tasks completed this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Reviewer subagent. Review the tasks completed in this iteration.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.
2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.

Plan location: .workflow-adapter/{subject}/plan.md
Tasks completed this iteration: {list of tasks that were pending at start of this iteration}

For each completed task:
1. Verify the completion criteria listed in plan.md are actually met
2. Check for correctness, security, and consistency
3. Verify that verification methods were applied where specified

Write your full review to .workflow-adapter/{subject}/iter-{N}-review.md in this format:
Status: PASS or NEEDS REVISION
Issues:
- [CRITICAL|WARNING] {description} (Task N)
Recommendations:
- {specific fix}

Then output ONLY this one line:
Status: PASS
or
Status: NEEDS REVISION — {1-2 sentence summary of the most critical issues}"
})
```

**If `copilot_mode = true`:**

Spawn a **foreground Copilot reviewer Task**:

```
Task({
  description: "Copilot reviewer: verify tasks this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Copilot dispatcher for review. Write a prompt file and run Copilot CLI.

Subject: {subject}
Copilot model: {copilot_model}
Tasks completed this iteration: {list of tasks that were pending at start of this iteration}

Step 1: Write the prompt file to .workflow-adapter/{subject}/prompt-reviewer.md using the Write tool:

---
You are a Reviewer. Review the tasks completed in this iteration.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.
Also read .workflow-adapter/principle.reviewer.md if it exists (takes priority).

Plan location: .workflow-adapter/{subject}/plan.md
Tasks completed this iteration: {task list}

For each completed task:
1. Verify the completion criteria listed in plan.md are actually met
2. Check for correctness, security, and consistency
3. Verify that verification methods were applied where specified

Write your full review to .workflow-adapter/{subject}/iter-{N}-review.md in this format:
Status: PASS or NEEDS REVISION
Issues:
- [CRITICAL|WARNING] {description} (Task N)
Recommendations:
- {specific fix}
---

Step 2: Run Copilot CLI via Bash:
bash '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.sh' --prompt-file '.workflow-adapter/{subject}/prompt-reviewer.md' --model '{copilot_model}' --timeout 600

Step 3: Read .workflow-adapter/{subject}/iter-{N}-review.md and extract the Status line.
Output ONLY: Status: PASS or Status: NEEDS REVISION — {summary}"
})
```

**If the reviewer returns `NEEDS REVISION`:**
1. Read `.workflow-adapter/{subject}/iter-{N}-review.md` to get the full list of CRITICAL issues.
2. For each CRITICAL issue: spawn a fix subagent (foreground, `run_in_background: false`). Pass the review file path and task number — instruct the fix subagent to read the file directly rather than receiving the issues inline. Instruct it to output only: "Fix applied: {file} — {one-line description}".
3. After the fix subagent completes, re-run the reviewer subagent once more to confirm the fix.
4. Repeat this retry cycle at most **2 times** total within this iteration.
5. If still failing after 2 retry cycles, proceed to Step 6 with the unresolved issues noted.

## Step 6: Update Loop State

Update (or add) the `## Loop State` section at the **end** of `.workflow-adapter/{subject}/plan.md` with:

```markdown
## Loop State
- **Current Iteration**: {N}/{max_iterations}
- **History**:
  - Iteration 1: {PASS|NEEDS REVISION} ({x}/{total} tasks complete{, issues: ... if NEEDS REVISION})
  - Iteration 2: {PASS|NEEDS REVISION} ({x}/{total} tasks complete{, issues: ...})
  - Iteration {N}: IN PROGRESS
```

Preserve all previous history entries. Update only the `Current Iteration` line and append the new entry for this iteration (changing the previous `IN PROGRESS` entry to the actual result).

## Step 7: Completion Check

Count all tasks in plan.md. Check if every task is marked `[x]`.

**If all tasks are `[x]` AND the reviewer returned `PASS`:**
- Output exactly:
  ```
  <promise>ALL JOB COMPLETE</promise>
  ```
  The Stop hook will detect this tag, remove the state file, and allow the session to end normally.

**If tasks remain incomplete OR the reviewer returned `NEEDS REVISION` after max retry cycles:**
- Output a status summary in this format:
  ```
  Iteration {N}/{max_iterations} complete. {remaining} tasks remaining: {list of task numbers and titles with status}.
  Issues: {issues from reviewer if any}.
  ```
  The Stop hook will re-inject this prompt to continue the loop in the next iteration.

**Edge Cases:**

- **All tasks already complete on first run** (plan has no `[ ]`, `[~]`, or `[!]` tasks before any work is done):
  Tell the user: "All tasks in plan.md are already marked complete. No Ralph loop needed."
  Output: `<promise>ALL JOB COMPLETE</promise>`
  (Do not create the state file in this case — skip Step 2's init script call.)

- **Max iterations reached without completion**:
  The Stop hook handles this automatically by reading `iteration >= max_iterations` from the state file and exiting cleanly. You do not need to handle this case explicitly — simply output the status summary as above and the hook will terminate the loop.
