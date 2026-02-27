# Subagent Mode Design

**Date**: 2026-02-27
**Status**: Approved
**Scope**: All 4 workflow skills — execute, plan, brainstorming, investigate

---

## Problem

The current workflow skills use `TeamCreate` + `SendMessage` for multi-agent coordination. This adds complexity (team lifecycle, messaging protocol, shutdown handshake) even for simple workflows that don't need real-time agent-to-agent communication.

## Solution

Add a `--subagent` flag to each skill. When present, the orchestrator skips team infrastructure and runs agents as direct `Task` calls. Coordination happens via shared files (`plan.md`) rather than messaging.

---

## Comparison: Teammate vs Subagent Mode

| Aspect | Teammate mode | Subagent mode |
|---|---|---|
| Team | `TeamCreate` required | No team |
| Communication | `SendMessage` (real-time) | File-based (`plan.md`) + TaskOutput |
| Agent lifecycle | Long-lived, async | One-shot, returns result |
| Parallelism | Background spawn + message coordination | Background `Task` + `TaskOutput` polling |
| Reviewer | Ongoing, reacts to messages | Spawned as `Task` after each executer batch |
| Complexity | High (team + messaging overhead) | Low (direct calls) |

---

## Implementation: `--subagent` Flag

Each skill's SKILL.md receives:
1. A note in the `argument-hint` field mentioning `--subagent`
2. A **"Subagent Mode"** section that replaces the teammate spawning steps when `--subagent` is detected

### Detecting the Flag

At the top of each skill, after reading the subject:
```
If the argument contains "--subagent", activate Subagent Mode for all subsequent steps.
```

---

## Per-Skill Design

### 1. execute --subagent

**Changed steps** (replaces Steps 3–8 from teammate mode):

**Step 3: Group tasks into parallel batches**
- Read `plan.md` and `worker.md`
- Group tasks into dependency-ordered batches: tasks with no unfinished dependencies form one batch
- Assign tasks to executer "slots" (alpha, beta, etc.) within each batch

**Step 4: Spawn executer subagents per batch**
For each batch, run all tasks as background `Task` calls simultaneously:
```
Task({
  description: "Executer Alpha: implement tasks",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<subagent executer system prompt>\n\nSubject: {subject}\nAssigned tasks: ...\nPlan location: .workflow-adapter/{subject}/plan.md\n\nUpdate plan.md with progress. No SendMessage available."
})
```
Wait for all batch Tasks via `TaskOutput`.

**Step 5: Spawn reviewer subagent after each batch**
After collecting all batch results:
```
Task({
  description: "Reviewer: verify completed tasks",
  subagent_type: "general-purpose",
  prompt: "<subagent reviewer system prompt>\n\nReview completed tasks from this batch against plan.md criteria.\nReturn: PASS or NEEDS REVISION with specific findings."
})
```
If reviewer returns NEEDS REVISION: spawn fix Tasks for affected executers, then re-review.

**Step 6: Continue to next batch**
Repeat Steps 4–5 until all plan.md tasks are `[x]`.

**Step 7: Final verification**
Run verification steps from plan.md directly (orchestrator executes, no subagent needed).

**Executer subagent prompt differences from teammate executer.md:**
- All `SendMessage` instructions removed
- Replace "report to orchestrator via SendMessage" with "update plan.md with status and findings"
- Replace conflict coordination with "write INTENT comment to plan.md before modifying shared files"

---

### 2. plan --subagent

**Changed steps**:

**Step 3: Orchestrator drafts plan.md**
Orchestrator writes the initial `plan.md` and `worker.md` directly (no reviewer teammate spawned yet).

**Step 4: Spawn reviewer subagent**
```
Task({
  description: "Reviewer: validate plan",
  subagent_type: "general-purpose",
  prompt: "<subagent reviewer prompt>\n\nReview plan.md and worker.md. Verify:\n- All tasks have measurable completion criteria\n- Dependencies are correctly ordered\n- Executer count is appropriate\nReturn: PASS or list of required changes."
})
```

**Step 5: Revise if needed**
If reviewer returns required changes: orchestrator updates plan.md, re-runs reviewer Task once.

No ongoing discussion phase (requires messaging). Single-pass review.

---

### 3. brainstorming --subagent

**Changed steps** (replaces teammate spawning):

**Step 3: Spawn historian and researcher in parallel**
```
Task({ description: "Historian: gather past context", run_in_background: true, prompt: "..." })
Task({ description: "Researcher: research topic", run_in_background: true, prompt: "..." })
```
Both write results to `.workflow-adapter/{subject}/` (historian to git/CLAUDE.md context, researcher to `doc/`).

**Step 4: Wait and synthesize**
Orchestrator collects both TaskOutputs, synthesizes into `brainstorming.md`.

**Step 5: Spawn reviewer subagent**
```
Task({
  description: "Reviewer: review brainstorming",
  subagent_type: "general-purpose",
  prompt: "<subagent reviewer prompt>\n\nReview brainstorming.md. Challenge assumptions, find gaps.\nReturn: PASS or list of issues."
})
```

**Step 6: Address findings**
If reviewer finds critical issues: orchestrator decides whether to re-run researcher Task for specific gaps, or revise brainstorming.md directly.

No discussion phase (which requires SendMessage round-trips between agents).

---

### 4. investigate --subagent

Same as `brainstorming --subagent` with one addition:

**After researcher returns**: Orchestrator reads researcher output. If it contains signals of telemetry gaps (keywords: "insufficient logs", "cannot determine", "missing traces"), spawn enricher:
```
Task({
  description: "Enricher: add instrumentation",
  subagent_type: "general-purpose",
  prompt: "<enricher prompt>\n\nAdd targeted instrumentation as identified by researcher output:\n{relevant_researcher_findings}"
})
```
After enricher completes: orchestrator re-runs researcher Task to validate findings with new telemetry.

---

## Files to Change

| File | Change |
|---|---|
| `skills/execute/SKILL.md` | Add `--subagent` detection + Subagent Mode section |
| `skills/plan/SKILL.md` | Add `--subagent` detection + Subagent Mode section |
| `skills/brainstorming/SKILL.md` | Add `--subagent` detection + Subagent Mode section |
| `skills/investigate/SKILL.md` | Add `--subagent` detection + Subagent Mode section |

No new files needed. The subagent system prompts are inlined in the skill (trimmed versions of existing agent .md files, with SendMessage instructions replaced).

---

## Out of Scope

- Checkpoint recovery in subagent mode (subagents are short-lived; orchestrator re-reads plan.md to recover state)
- Worktree isolation in subagent mode (can be added later if needed)
- Dynamic task reassignment (no messaging, so orchestrator simply spawns a new Task if one fails)
