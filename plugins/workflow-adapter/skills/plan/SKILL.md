---
name: plan
description: Creates a detailed execution plan (plan.md and worker.md) from brainstorming or investigation results. Spawns a reviewer teammate to validate task definitions, completion criteria, and worker allocation. Requires a subject folder with brainstorming.md or investigation.md.
argument-hint: "<optional: subject name> [--yes] [--subagent] [--codex]"
---

You are the **Orchestrator** (team leader) for a planning workflow. You create a detailed execution plan from brainstorming or investigation results.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

**Backlog Check:**
Check if `.workflow-adapter/backlog/` exists and contains `.md` files with `status: pending` in their frontmatter. **Skip any item whose status is `consumed` or `deferred`** — closed items must not appear in the prompt. If pending items exist, briefly list them to the user and ask:
```
AskUserQuestion({
  questions: [{
    question: "There are pending backlog items:\n\n{list of pending items with type and priority}\n\nWould you like to incorporate any of these into the plan?",
    header: "Backlog",
    options: [
      { label: "Yes", description: "I'll add some backlog items as tasks in the plan" },
      { label: "No", description: "Proceed without addressing backlog items" },
      { label: "Other / ask", description: "I want to type freely or ask a question before deciding" }
    ],
    multiSelect: false
  }]
})
```
If yes, ask which items to include and add them as tasks in the plan. **Record the list of item filenames you incorporated** — at the end of the session (after plan.md/worker.md are finalized) you MUST update each incorporated item's frontmatter `status: pending → consumed`. If no or if the backlog directory is empty/missing, proceed normally.

**User Interaction Policy (applies to every `AskUserQuestion` in this skill):**
- Every question must include an `{ label: "Other / ask", description: "I want to type freely or ask a question before deciding" }` option. When selected, read the user's typed reply and handle it (answer the question, apply the feedback, or re-ask with their context). Never force the user into preset options.
- **Final approval question — chain option:** The final approve/confirm question in Step 7 MUST include an additional `{ label: "Approve + start execute", description: "Approve and immediately launch /workflow-adapter:execute for this subject" }` option. When selected, finalize plan.md/worker.md as usual, then invoke `Skill({ skill: "workflow-adapter:execute", args: "{subject}" })`.

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
- `spec.md` — output from the spec workflow (most detailed technical design, preferred if exists)
- `brainstorming.md` — output from the brainstorming workflow
- `investigation.md` — output from the investigate workflow

Read ALL that exist. When spec.md is present, use it as the PRIMARY source for
technical decisions, interface contracts, and acceptance criteria. Use brainstorming.md
or investigation.md for context and the Decision Registry. If spec.md has its own
Decision Registry (which extends the source registry), prefer spec.md's registry
as it is a superset.

Also read any research documents in `.workflow-adapter/{subject}/doc/`.

If none of `spec.md`, `brainstorming.md`, or `investigation.md` exists, inform the user to run `/workflow-adapter:brainstorming` or `/workflow-adapter:investigate` first.

## Step 3: Ask About Worktree

Use AskUserQuestion to ask the user:
- "Should this plan use a git worktree for isolated work?"
- Explain: worktree creates a single isolated copy of the repository for this subject — all executers work inside it, keeping the main branch untouched
- Options: Yes (recommended — isolates all changes from main), No (simpler, work directly on current branch)

## Step 3.5: Decision Coverage Checklist

Before creating plan.md, validate decision coverage from source documents:

1. Read the source documents and check for a `## Decision Registry` section. If both spec.md and brainstorming.md/investigation.md exist, prefer the Decision Registry from spec.md as it is a superset (contains both original decisions and new technical decisions from the spec phase).
2. If a Decision Registry exists:
   a. Parse the registry table
   b. For each decision with status `accepted`:
      - Map it to a planned task — note which task will address it
   c. For each decision with status `unresolved`:
      - Use AskUserQuestion to get the user's decision before planning
      - Update the registry entry status based on user's answer
   d. For each decision with status `open`:
      - Ask the user: create a research task, or defer to backlog?
      - If deferred: mark as `deferred` in the registry
   e. Present the completed checklist to the user:
      ```
      AskUserQuestion({
        questions: [{
          question: "Decision coverage check from brainstorming/investigation:\n\n{for each decision: checkbox, ID, decision text, → planned task or DEFERRED}\n\nAny missing items?",
          header: "Decision Coverage",
          options: [
            { label: "Looks complete", description: "All decisions are accounted for" },
            { label: "Add missing items", description: "I want to add decisions that were missed" }
          ],
          multiSelect: false
        }]
      })
      ```
   f. If user adds items, incorporate them into the plan
3. If no Decision Registry exists (old-format source document):
   - Warn: "No Decision Registry found in source document. Decision coverage cannot be validated automatically. Consider re-running brainstorming/investigation to generate a registry."
   - Continue without validation

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

## Decision Traceability

Populate this section based on the Decision Coverage Checklist from Step 3.5. Every `accepted` decision must map to at least one task. `DEFERRED` items will be auto-added to backlog in Step 4.5.

| Decision ID | Decision | Task(s) | Notes |
|-------------|----------|---------|-------|
| D1 | {decision text} | Task N, Task M | {implementation notes} |
| D2 | {decision text} | DEFERRED | Added to backlog |

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

## Step 4.5: Auto-Backlog for Deferred Decisions

After creating plan.md, check the Decision Traceability section for deferred decisions:

1. Read the just-created plan.md's Decision Traceability section
2. For each row where Notes contains "DEFERRED" or "Added to backlog":
   a. Create `.workflow-adapter/backlog/` directory if it doesn't exist: `mkdir -p .workflow-adapter/backlog`
   b. Create a backlog file: `.workflow-adapter/backlog/{decision_id}-{slug}.md`
      - Slug: first 6 words of decision text, lowercased, hyphens, max 50 chars
      - Example: `D3-use-kubernetes-for-deployment.md`
   c. File content:
      ```markdown
      ---
      type: task
      priority: medium
      source: {subject}
      status: pending
      decision_id: {D-number}
      ---
      # {Decision text}
      Deferred from {subject} planning. Original source: {source section in brainstorming/investigation}.
      ```
3. If no deferred decisions exist, skip silently
4. If backlog items were created, inform the user: "Created {N} backlog item(s) for deferred decisions: {list of decision IDs}"

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
    question: "Here is the execution plan summary:\n\n**Tasks**: {number of tasks}\n**Executers**: {number and names}\n**Worktree**: {yes/no}\n\n**Task List:**\n{numbered list of tasks with assigned executer and dependencies}\n\n**Reviewer Concerns:**\n{any unresolved concerns, or 'None'}\n\nIs this plan appropriate?",
    header: "Confirm",
    options: [
      { label: "Approve plan", description: "Plan looks good. Finalize and stop here." },
      { label: "Revise", description: "I want to adjust some tasks or allocation before finalizing." },
      { label: "Other / ask", description: "I want to type freely or ask a question before deciding" },
      { label: "Approve + start execute", description: "Approve and immediately launch /workflow-adapter:execute for this subject" }
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
  prompt: "You are a Reviewer subagent. Review a draft execution plan.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nReview these files:\n- .workflow-adapter/{subject}/plan.md\n- .workflow-adapter/{subject}/worker.md\n\nAlso check for source documents (spec.md, brainstorming.md, investigation.md) in .workflow-adapter/{subject}/ to verify plan coverage. If spec.md exists, it is the primary source for technical decisions and its Decision Registry is the authoritative superset.\n\n(Substitute the actual subject name for {subject} above.)\n\nVerify:\n- Every task has clear, measurable completion criteria (reject vague criteria like 'improved performance' without a metric)\n- Every task has a verification method\n- Task dependencies are correctly ordered\n- Executer count and task allocation is balanced\n- No tasks are missing from the original brainstorming/investigation/spec scope\n- Verify that the plan's Decision Traceability section covers all `accepted` decisions from the source Decision Registry. If spec.md exists, prefer its Decision Registry as the authoritative source. If no Decision Registry exists in any source document, mark Decision Coverage as N/A.\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description} (Task N or general)\nRecommendations:\n- {specific text to add or change in plan.md}"
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

Also check for source documents (spec.md, brainstorming.md, investigation.md) in .workflow-adapter/{subject}/ to verify plan coverage. If spec.md exists, it is the primary source for technical decisions and its Decision Registry is the authoritative superset.

Verify:
- Every task has clear, measurable completion criteria
- Every task has a verification method
- Task dependencies are correctly ordered
- Executer count and task allocation is balanced
- No tasks are missing from the original brainstorming/investigation/spec scope
- Verify that the plan's Decision Traceability section covers all `accepted` decisions from the source Decision Registry. If spec.md exists, prefer its Decision Registry as the authoritative source. If no Decision Registry exists in any source document, mark Decision Coverage as N/A.

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
