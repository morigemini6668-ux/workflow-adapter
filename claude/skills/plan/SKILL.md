---
name: plan
description: Creates a detailed execution plan (plan.md and worker.md) from brainstorming or investigation results. Spawns a reviewer teammate to validate task definitions, completion criteria, and worker allocation. Requires a subject folder with brainstorming.md or investigation.md.
argument-hint: "<optional: subject name> [--yes] [--subagent] [--codex]"
disable-model-invocation: true
---

You are the **Orchestrator** (team leader) for a planning workflow. You create a detailed execution plan from brainstorming or investigation results.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

**Backlog Check:**
Check if `.workflow-adapter/backlog/` exists and contains `.md` files with `status: pending` in their frontmatter. If pending items exist, briefly list them to the user and ask:
```
AskUserQuestion({
  questions: [{
    question: "There are pending backlog items:\n\n{list of pending items with type and priority}\n\nWould you like to incorporate any of these into the plan?",
    header: "Backlog",
    options: [
      { label: "Yes", description: "I'll add some backlog items as tasks in the plan" },
      { label: "No", description: "Proceed without addressing backlog items" }
    ],
    multiSelect: false
  }]
})
```
If yes, ask which items to include and add them as tasks in the plan. If no or if the backlog directory is empty/missing, proceed normally.

## Step 0: Parse Options

Check if the user's argument contains `--yes` flag:
- If `--yes` is present, set `auto_confirm = true` and remove `--yes` from the subject name
- If `--yes` is absent, set `auto_confirm = false`

When `auto_confirm = false`, a final confirmation step will be performed before finalizing (see Step 7).

Also check for `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the subject name
- If `--subagent` is absent, set `subagent_mode = false`

Also check for `--codex` flag:
- If `--codex` is present, set `codex_mode = true` and remove `--codex` from the subject name
- If `--codex` is absent, set `codex_mode = false`

When `subagent_mode = true`, follow Steps 1–5 as normal, then **skip Steps 6 and 8 entirely and proceed to "## Subagent Mode"** below instead.

When `codex_mode = true`, follow Steps 1–5 as normal, then **skip Steps 6 and 8 entirely and proceed to "## Codex Mode"** below instead.

## Step 1: Identify the Subject

If a subject was provided as an argument, use it. Otherwise:
1. Check `.workflow-adapter/` for existing subject folders
2. If multiple subjects exist, use AskUserQuestion to ask which one to plan for
3. If no subjects exist, inform the user to run `/workflow-adapter:brainstorming` or `/workflow-adapter:investigate` first

## Step 2: Read Source Results

Check which source documents exist in `.workflow-adapter/{subject}/`:
- `brainstorming.md` — output from the brainstorming workflow
- `investigation.md` — output from the investigate workflow

Read whichever exists (or both if both exist). Also read any research documents in `.workflow-adapter/{subject}/doc/`.

If neither `brainstorming.md` nor `investigation.md` exists, inform the user to run `/workflow-adapter:brainstorming` or `/workflow-adapter:investigate` first.

## Step 3: Ask About Worktree

Use AskUserQuestion to ask the user:
- "Should this plan use a git worktree for isolated work?"
- Explain: worktree creates a single isolated copy of the repository for this subject — all executers work inside it, keeping the main branch untouched
- Options: Yes (recommended — isolates all changes from main), No (simpler, work directly on current branch)

## Step 4: Create plan.md

Create `.workflow-adapter/{subject}/plan.md` with this structure:

```markdown
# Execution Plan: {subject}

## Overview
{Brief description of what will be accomplished}

## Configuration
- **Worktree**: Yes/No
- **Worktree Branch** (if Yes): {subject}
- **Worktree Path** (if Yes): {repo_root}/../{subject}-worktree
- **Main Repo**: {repo_root}
- **Executers**: {number} (see worker.md)

> **Note on worktree**: When worktree is enabled, all executers work inside a single shared worktree directory for code changes. The `.workflow-adapter/` directory (plan.md, checkpoints) stays in the main repo. The orchestrator creates and removes the worktree — individual executers do not manage worktrees themselves.

## Tasks

### Task 1: {task title}
- **Assigned to**: executer-alpha / executer-beta / etc.
- **Dependencies**: None / Task N
- **Status**: [ ] Pending
- **Description**: {what needs to be done}
- **Completion Criteria**: {specific, measurable criteria for this task}
- **Verification Method**: {how to verify this task is done correctly}
- **Changes**: (to be filled during execution)

### Task 2: {task title}
...

## Verification Plan
{Overall verification strategy for the entire plan}
- [ ] {Verification step 1}
- [ ] {Verification step 2}
...

## Progress Log
(to be filled during execution)
```

**Critical Requirements for plan.md:**
- Every task MUST have clear, measurable **Completion Criteria**
- Every task MUST have a **Verification Method**
- Tasks should be ordered by dependency
- Parallel-safe tasks should be clearly marked
- Status tracking: `[ ]` pending, `[~]` in progress, `[x]` completed, `[!]` blocked

## Step 5: Create worker.md

Based on the task list, determine how many executers are needed for parallel work.

Create `.workflow-adapter/{subject}/worker.md`:

```markdown
# Worker Configuration: {subject}

## Executers
- **Total**: {number}
- **Worktree**: Yes/No
- **Worktree Branch** (if Yes): {subject}
- **Worktree Path** (if Yes): {repo_root}/../{subject}-worktree

### executer-alpha
- **Tasks**: Task 1, Task 3

### executer-beta
- **Tasks**: Task 2, Task 4

(add more as needed: gamma, delta, epsilon...)
```

## Step 6: Spawn Reviewer Teammate for Plan Validation

Create a team and spawn a reviewer:
```
TeamCreate({ team_name: "wa-{subject}-plan", description: "Plan review for {subject}" })
```

Read the reviewer system prompt from `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`, then spawn:
```
Task({
  description: "Reviewer: validate plan",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}-plan",
  name: "reviewer",
  run_in_background: true,
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\nTeam name: wa-{subject}-plan\nYour teammate name: reviewer\nTeam leader: orchestrator\n\nReview the plan at .workflow-adapter/{subject}/plan.md and worker.md. Verify:\n- All completion criteria are clear and measurable\n- All verification methods are defined\n- Task dependencies are correct\n- Worker allocation is balanced\nSend your review findings to the orchestrator."
})
```

Messages from the reviewer are automatically delivered to you. If the reviewer finds issues, fix them and ask for re-review:
```
SendMessage({ to: "reviewer", message: "Plan updated. Please re-review.", summary: "Requesting plan re-review" })
```

**Handle failures**: If the reviewer fails to spawn or becomes unresponsive:
- Inform the user that plan review could not be performed automatically
- Present the plan directly to the user for manual review in Step 7
- Continue the workflow — do not block on reviewer failure

## Step 7: Final Confirmation (if auto_confirm = false)

**Skip this step if `auto_confirm = true`.**

Before finalizing, present the plan summary to the user using AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "Here is the execution plan summary:\n\n**Tasks**: {number of tasks}\n**Executers**: {number and names}\n**Worktree**: {yes/no}\n\n**Task List:**\n{numbered list of tasks with assigned executer and dependencies}\n\n**Reviewer Concerns:**\n{any unresolved concerns, or 'None'}\n\nIs this plan appropriate? Select 'Approve' to finalize, or 'Revise' to make changes.",
    header: "Confirm",
    options: [
      { label: "Approve plan", description: "Plan looks good. Finalize and proceed." },
      { label: "Revise", description: "I want to adjust some tasks or allocation before finalizing." }
    ],
    multiSelect: false
  }]
})
```

If the user selects **"Revise"**:
- Ask which specific aspects they want to change (tasks, allocation, dependencies, etc.)
- Update plan.md and worker.md accordingly
- Ask the reviewer to re-validate if changes are significant
- Repeat this confirmation step after revisions are complete

If the user selects **"Approve plan"**, proceed to Step 8.

## Step 8: Shutdown Team

After user approves:
```
SendMessage({ to: "reviewer", message: { type: "shutdown_request", reason: "Plan approved" } })
```

Wait for all teammates to confirm shutdown (shutdown_approved messages) before calling TeamDelete().

```
TeamDelete()
```

Inform the user that the plan is ready and suggest running `/workflow-adapter:execute` to start execution.

**Backlog Offer:**
Before ending, ask the user if any items identified during planning should be deferred to the backlog:
```
AskUserQuestion({
  questions: [{
    question: "Were there any out-of-scope items or follow-up tasks identified during planning that should be added to the backlog for later?",
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

_Used when `--subagent` flag is set. No TeamCreate. Reviewer runs as a single foreground Task instead of a teammate._

Steps 1–5 (identify subject, read source, ask worktree, create plan.md, create worker.md) run unchanged.

### SA-Step 6: Spawn Reviewer Subagent

Spawn the reviewer as a **foreground Task** (do NOT set `run_in_background: true` — wait for result):

```
Task({
  description: "Reviewer: validate plan",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Reviewer subagent. Review a draft execution plan.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nReview these files:\n- .workflow-adapter/{subject}/plan.md\n- .workflow-adapter/{subject}/worker.md\n\n(Substitute the actual subject name for {subject} above.)\n\nVerify:\n- Every task has clear, measurable completion criteria (reject vague criteria like 'improved performance' without a metric)\n- Every task has a verification method\n- Task dependencies are correctly ordered\n- Executer count and task allocation is balanced\n- No tasks are missing from the original brainstorming/investigation scope\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description} (Task N or general)\nRecommendations:\n- {specific text to add or change in plan.md}"
})
```

### SA-Step 7: Revise If Needed

Read the reviewer Task's returned text:
- If `Status: PASS`: proceed directly to the **"## Step 7: Final Confirmation"** section above (if `auto_confirm = false`) or inform the user that the plan is ready (if `auto_confirm = true`).
- If `Status: NEEDS REVISION`: apply all CRITICAL changes to plan.md (orchestrator edits directly), then spawn the reviewer Task once more to confirm. If it still returns NEEDS REVISION, surface remaining issues to the user via AskUserQuestion. WARNING-level issues are applied at orchestrator discretion — apply them if they improve clarity, otherwise note them for the user during Step 7.

**No TeamDelete needed** — no team was created in subagent mode.

---

## Codex Mode

_Used when `--codex` flag is set. No TeamCreate. Reviewer is delegated to Codex CLI via `codex-client.ts`._

Steps 1–5 (identify subject, read source, ask worktree, create plan.md, create worker.md) run unchanged.

### CX-Step 6: Spawn Codex Reviewer

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run the steps inside the prompt yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

Spawn the reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Codex reviewer: validate plan",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<codex-dispatcher-prompt>
You are a Codex dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run codex-client.ts via Bash, (3) report the result.

Subject: {subject}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-reviewer.md with this exact content:

You are a Reviewer. Review a draft execution plan.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.
Also read .workflow-adapter/principle.reviewer.md if it exists (takes priority).

Review these files:
- .workflow-adapter/{subject}/plan.md
- .workflow-adapter/{subject}/worker.md

Verify:
- Every task has clear, measurable completion criteria
- Every task has a verification method
- Task dependencies are correctly ordered
- Executer count and task allocation is balanced
- No tasks are missing from the original brainstorming/investigation scope

Write your review to .workflow-adapter/{subject}/plan-review.md in this format:
Status: PASS or NEEDS REVISION
Issues:
- [CRITICAL|WARNING] {description} (Task N or general)
Recommendations:
- {specific text to add or change in plan.md}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/codex-client.ts' --writable --prompt-file '.workflow-adapter/{subject}/prompt-reviewer.md'

3. Read .workflow-adapter/{subject}/plan-review.md and extract the Status line.
Output ONLY: Status: PASS or Status: NEEDS REVISION — {summary}
</codex-dispatcher-prompt>"
})
```

### CX-Step 7: Revise If Needed

Read the reviewer Task's returned text:
- If `Status: PASS`: proceed directly to the **"## Step 7: Final Confirmation"** section above (if `auto_confirm = false`) or inform the user that the plan is ready (if `auto_confirm = true`).
- If `Status: NEEDS REVISION`: apply all CRITICAL changes to plan.md (orchestrator edits directly), then spawn the Codex reviewer Task once more to confirm. If it still returns NEEDS REVISION, surface remaining issues to the user via AskUserQuestion.

**No TeamDelete needed** — no team was created in Codex mode.
