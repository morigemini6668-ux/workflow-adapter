# Subagent Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `--subagent` flag to all 4 workflow skills (execute, plan, brainstorming, investigate) so they run agents as direct Task calls instead of teammates with TeamCreate/SendMessage.

**Architecture:** Each SKILL.md gets two additions: (1) `--subagent` detection in Step 0, and (2) a "## Subagent Mode" section at the bottom that replaces the teammate-spawning steps when the flag is present. The subagent prompts are inlined in the skill text (no new files needed).

**Tech Stack:** Plain Markdown skill files in `skills/*/SKILL.md`

---

## Overview of Changes Per Skill

All 4 tasks below are **independent** (different files). They can be executed in parallel.

---

### Task 1: Add --subagent mode to `execute` skill

**Files:**
- Modify: `skills/execute/SKILL.md`

**Step 1: Update `argument-hint` in frontmatter**

Change line 4 from:
```
argument-hint: <optional: subject name>
```
to:
```
argument-hint: <optional: subject name> [--subagent]
```

**Step 2: Add `--subagent` detection to Step 0**

After the frontmatter block (after line 6 `---`), insert a new **Step 0** section before the current "Step 1: Identify the Subject" heading:

```markdown
## Step 0: Parse Options

Check if the user's argument contains `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the subject name
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip to "## Subagent Mode"** below instead of continuing to Steps 3–8.

```

**Step 3: Add `## Subagent Mode` section at the bottom of the file**

Append after the last line of the file:

```markdown
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
  prompt: "You are an Executer subagent responsible for implementation work.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.executer.md if it exists — it takes priority.\n\nSubject: {subject}\nPlan location: .workflow-adapter/{subject}/plan.md\nAssigned tasks: {task titles and numbers}\n\nExecution Process:\n1. Read plan.md to understand your assigned tasks and dependencies\n2. For each assigned task:\n   a. Mark task as [~] in progress in plan.md\n   b. Perform the implementation work using all available tools\n   c. Verify the work meets the completion criteria defined in plan.md\n   d. Mark task as [x] completed with a brief note of changes made\n   e. If blocked: mark as [!] and write BLOCKED: {reason} in plan.md\n3. After each task, save a checkpoint to .workflow-adapter/{subject}/checkpoint-{slot}.md:\n   Format: ## Completed: {task}\n   ## Files Modified: {list}\n   ## Next: {next task or 'Done'}\n\nNo messaging is available. Update plan.md directly for all status reporting."
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
```

**Step 4: Verify**

Read `skills/execute/SKILL.md` and confirm:
- `argument-hint` contains `[--subagent]`
- `## Step 0: Parse Options` section exists and mentions `--subagent`
- `## Subagent Mode` section exists at the bottom with SA-Steps 3–7

**Step 5: Commit**
```bash
git add skills/execute/SKILL.md
git commit -m "feat: Add --subagent mode to execute skill"
```

---

### Task 2: Add --subagent mode to `plan` skill

**Files:**
- Modify: `skills/plan/SKILL.md`

**Step 1: Update `--subagent` detection in Step 0**

The plan skill already has Step 0 for `--yes` parsing (line 15–21). Add `--subagent` detection to the existing Step 0 block.

Find the existing Step 0 content:
```
Check if the user's argument contains `--yes` flag:
- If `--yes` is present, set `auto_confirm = true` and remove `--yes` from the subject name
- If `--yes` is absent, set `auto_confirm = false`

When `auto_confirm = false`, a final confirmation step will be performed before finalizing (see Step 7).
```

Replace with:
```
Check if the user's argument contains `--yes` flag:
- If `--yes` is present, set `auto_confirm = true` and remove `--yes` from the subject name
- If `--yes` is absent, set `auto_confirm = false`

When `auto_confirm = false`, a final confirmation step will be performed before finalizing (see Step 7).

Also check for `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the subject name
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–5 as normal, then **skip Steps 6 and 8 and follow "## Subagent Mode"** below instead.
```

**Step 2: Update `argument-hint`**

Change:
```
argument-hint: <optional: subject name> [--yes]
```
to:
```
argument-hint: <optional: subject name> [--yes] [--subagent]
```

**Step 3: Add `## Subagent Mode` section at the bottom**

Append after the last line:

```markdown
---

## Subagent Mode

_Used when `--subagent` flag is set. No TeamCreate. Reviewer runs as a single foreground Task._

Steps 1–5 (identify subject, read source, ask worktree, create plan.md, create worker.md) run unchanged.

Then:

### SA-Step 6: Spawn Reviewer Subagent

Spawn the reviewer as a **foreground Task** (wait for result — do NOT set `run_in_background`):

```
Task({
  description: "Reviewer: validate plan",
  subagent_type: "general-purpose",
  prompt: "You are a Reviewer subagent. Review a draft execution plan.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nReview these files:\n- .workflow-adapter/{subject}/plan.md\n- .workflow-adapter/{subject}/worker.md\n\nVerify:\n- Every task has clear, measurable completion criteria (not vague like 'improved performance')\n- Every task has a verification method\n- Task dependencies are correctly ordered\n- Executer count and task allocation is balanced\n- No tasks are missing from the original brainstorming/investigation scope\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description} (Task N or general)\nRecommendations:\n- {specific text to add or change in plan.md}"
})
```

### SA-Step 7: Revise If Needed

If reviewer returns `NEEDS REVISION`:
1. Apply all CRITICAL changes to plan.md (orchestrator edits directly)
2. Re-spawn reviewer Task once more to confirm
3. If still NEEDS REVISION: surface remaining issues to user via AskUserQuestion

If reviewer returns `PASS` (or after revision passes): proceed to the normal **Step 7: Final Confirmation** (if `auto_confirm = false`) and then **inform user that plan is ready** to run `/workflow-adapter:execute`.

**No TeamDelete needed** — no team was created.
```

**Step 4: Verify**

Read `skills/plan/SKILL.md` and confirm:
- `argument-hint` has `[--subagent]`
- Step 0 mentions `subagent_mode`
- `## Subagent Mode` section exists with SA-Steps 6–7

**Step 5: Commit**
```bash
git add skills/plan/SKILL.md
git commit -m "feat: Add --subagent mode to plan skill"
```

---

### Task 3: Add --subagent mode to `brainstorming` skill

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

**Step 1: Update Step 0 — add `--subagent` detection**

The brainstorming skill has Step 0 for `--yes` (lines 16–21). Add after the existing `--yes` block:

```
Also check for `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the subject description
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–5 and 8, follow "## Subagent Mode"** below instead.
```

**Step 2: Update `argument-hint`**

Change:
```
argument-hint: <optional: subject description> [--yes]
```
to:
```
argument-hint: <optional: subject description> [--yes] [--subagent]
```

**Step 3: Add `## Subagent Mode` section at the bottom**

Append after the last line:

```markdown
---

## Subagent Mode

_Used when `--subagent` flag is set. No TeamCreate, no discussion phase. Historian and researcher run as parallel background Tasks. Reviewer runs as a single foreground Task._

Steps 1–2 (determine subject, create folder structure) run unchanged.

Then:

### SA-Step 3: Spawn Historian and Researcher in Parallel

Spawn both as **background Tasks simultaneously**:

```
Task({
  description: "Historian: gather project context",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Historian subagent. Gather past context relevant to this subject.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.historian.md if it exists — it takes priority.\n\nSubject: {subject}\nDescription: {user's request}\n\nGather context from:\n- Project CLAUDE.md, CLAUDE.local.md, AGENTS.md (if they exist)\n- Recent git log entries related to the subject area\n- GitLab/GitHub issues and PRs if available via gh/glab CLI\n\nWrite findings to: .workflow-adapter/{subject}/doc/historian-context.md\nReturn a brief summary of your key findings."
})

Task({
  description: "Researcher: research subject",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Researcher subagent. Research this subject thoroughly.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.researcher.md if it exists — it takes priority.\n\nSubject: {subject}\nDescription: {user's request}\n\nResearch using all available tools (web search, Context7, codebase exploration, etc.).\nSave research documents to: .workflow-adapter/{subject}/doc/\n\nIf you need user input, write NEEDS USER INPUT: {question} as the first line of your response. The orchestrator will collect it before proceeding.\n\nReturn a structured summary of your key findings and recommendations."
})
```

Wait for both via `TaskOutput`.

### SA-Step 4: Handle User Input Requests

If researcher's result starts with `NEEDS USER INPUT:`:
1. Use AskUserQuestion to get the user's answer
2. Spawn a new researcher Task with the user's answer added to the prompt
3. Wait for the new result

### SA-Step 5: Spawn Reviewer Subagent

Spawn the reviewer as a **foreground Task**:

```
Task({
  description: "Reviewer: review brainstorming materials",
  subagent_type: "general-purpose",
  prompt: "You are a Reviewer subagent. Critically review the brainstorming materials.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nSubject: {subject}\nReview these files:\n- .workflow-adapter/{subject}/doc/historian-context.md (if exists)\n- All files in .workflow-adapter/{subject}/doc/ (researcher documents)\n\nChallenge assumptions, find gaps, propose alternatives. Act as Devil's Advocate.\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description}\nRecommendations:\n- {specific improvement}"
})
```

If reviewer returns `NEEDS REVISION` with CRITICAL issues:
- Orchestrator decides which gaps to address (spawn new researcher Task for specific gaps, or synthesize directly)
- One revision round maximum

### SA-Step 6 onward

Continue with the normal **Step 6: Final Confirmation** (if `auto_confirm = false`) and **Step 7: Save Results** unchanged.

**Step 8 replacement**: No team to shut down — skip `SendMessage` and `TeamDelete`.
```

**Step 4: Verify**

Read `skills/brainstorming/SKILL.md` and confirm:
- `argument-hint` has `[--subagent]`
- Step 0 mentions `subagent_mode`
- `## Subagent Mode` section exists with SA-Steps 3–5

**Step 5: Commit**
```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat: Add --subagent mode to brainstorming skill"
```

---

### Task 4: Add --subagent mode to `investigate` skill

**Files:**
- Modify: `skills/investigate/SKILL.md`

**Step 1: Update Step 0 — add `--subagent` detection**

The investigate skill has Step 0 for `--yes` (lines 18–23). Add after the existing `--yes` block:

```
Also check for `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the problem description
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–5 and 8, follow "## Subagent Mode"** below instead.
```

**Step 2: Update `argument-hint`**

Change:
```
argument-hint: <optional: problem description> [--yes]
```
to:
```
argument-hint: <optional: problem description> [--yes] [--subagent]
```

**Step 3: Add `## Subagent Mode` section at the bottom**

Append after the last line:

```markdown
---

## Subagent Mode

_Used when `--subagent` flag is set. No TeamCreate. Historian and researcher run as parallel background Tasks. Enricher spawned on-demand as Task. Reviewer runs as a single foreground Task._

Steps 1–2 (understand problem, create folder structure) run unchanged.

Then:

### SA-Step 3: Spawn Historian and Researcher in Parallel

Spawn both as **background Tasks simultaneously**:

```
Task({
  description: "Historian: gather project context for investigation",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Historian subagent. Gather past context relevant to this problem.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.historian.md if it exists — it takes priority.\n\nSubject: {subject}\nProblem: {user's problem description}\n\nFocus on: git blame for affected areas, related past incidents, previous fix attempts, known constraints.\nGather from: CLAUDE.md, git log, GitLab/GitHub issues and PRs.\n\nWrite findings to: .workflow-adapter/{subject}/doc/historian-context.md\nReturn a brief summary of your key findings."
})

Task({
  description: "Researcher: analyze problem",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Researcher subagent in INVESTIGATION mode.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.researcher.md if it exists — it takes priority.\n\nSubject: {subject}\nProblem: {user's problem description}\n\n**CRITICAL CONSTRAINT: You MUST NOT modify any code.** Read-only analysis only.\n\nAnalyze systematically:\n1. Identify affected code paths and components\n2. Trace data flow and control flow\n3. Look for anti-patterns, race conditions, misconfigurations\n4. Check dependency versions and known issues\n5. Propose hypotheses ranked by likelihood\n6. For each hypothesis: describe supporting/refuting evidence\n\nIf telemetry is insufficient to diagnose, write as the FIRST LINE of your response:\nTELEMETRY GAP: {specific gap} — Need instrumentation at {specific locations} to observe {specific behavior}\n\nSave analysis to .workflow-adapter/{subject}/doc/\nReturn a structured summary with hypotheses, evidence, and proposed solutions."
})
```

Wait for both via `TaskOutput`.

### SA-Step 4: Handle Telemetry Gap (on-demand)

If researcher's result starts with `TELEMETRY GAP:`:

1. Ask user if they want to add instrumentation:
   ```
   AskUserQuestion({
     questions: [{
       question: "Researcher cannot fully diagnose due to missing telemetry:\n\n{gap details}\n\nShould I spawn an enricher to add the necessary instrumentation?",
       header: "Telemetry",
       options: [
         { label: "Add telemetry", description: "Spawn enricher to add logging/metrics/tracing." },
         { label: "Skip", description: "Continue without additional telemetry." }
       ],
       multiSelect: false
     }]
   })
   ```

2. If approved, read `${CLAUDE_PLUGIN_ROOT}/agents/enricher.md` and spawn enricher as **foreground Task**:
   ```
   Task({
     description: "Enricher: add telemetry instrumentation",
     subagent_type: "general-purpose",
     prompt: "<system prompt from enricher.md>\n\nSubject: {subject}\nProblem: {problem description}\n\nTelemetry gap: {exact gap details from researcher}\n\nAdd the minimum necessary instrumentation. When done, return a summary of what was added."
   })
   ```

3. After enricher completes, spawn a new researcher Task with the enricher's results added to the prompt context. Wait for result.

### SA-Step 5: Spawn Reviewer Subagent

Spawn the reviewer as a **foreground Task**:

```
Task({
  description: "Reviewer: validate investigation findings",
  subagent_type: "general-purpose",
  prompt: "You are a Reviewer subagent in INVESTIGATION REVIEW mode.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nSubject: {subject}\nReview files in .workflow-adapter/{subject}/doc/\n\nFocus on:\n1. Are proposed root causes actually supported by evidence?\n2. Are there alternative explanations the researcher missed?\n3. For each proposed solution: What are the risks? Side effects?\n4. Is the solution proportional — not over-engineered?\n5. Quick wins vs. long-term fixes — are they distinguished?\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description}\nRecommendations:\n- {specific improvement}"
})
```

If reviewer returns `NEEDS REVISION` with CRITICAL issues:
- Orchestrator decides which gaps require re-investigation (spawn new researcher Task if needed)
- One revision round maximum

### SA-Step 6 onward

Continue with the normal **Step 6: Final Confirmation** (if `auto_confirm = false`) and **Step 7: Save Results** unchanged.

**Step 8 replacement**: No team to shut down — skip `SendMessage` and `TeamDelete`.
```

**Step 4: Verify**

Read `skills/investigate/SKILL.md` and confirm:
- `argument-hint` has `[--subagent]`
- Step 0 mentions `subagent_mode`
- `## Subagent Mode` section exists with SA-Steps 3–5

**Step 5: Commit**
```bash
git add skills/investigate/SKILL.md
git commit -m "feat: Add --subagent mode to investigate skill"
```

---

## Verification Plan

After all 4 tasks complete:

- [ ] `skills/execute/SKILL.md`: contains `[--subagent]` in argument-hint, Step 0 with `subagent_mode`, `## Subagent Mode` section with SA-Steps 3–7
- [ ] `skills/plan/SKILL.md`: contains `[--subagent]` in argument-hint, `subagent_mode` in Step 0, `## Subagent Mode` section with SA-Steps 6–7
- [ ] `skills/brainstorming/SKILL.md`: contains `[--subagent]` in argument-hint, `subagent_mode` in Step 0, `## Subagent Mode` section with SA-Steps 3–5
- [ ] `skills/investigate/SKILL.md`: contains `[--subagent]` in argument-hint, `subagent_mode` in Step 0, `## Subagent Mode` section with SA-Steps 3–5
- [ ] All 4 changes committed with descriptive messages
