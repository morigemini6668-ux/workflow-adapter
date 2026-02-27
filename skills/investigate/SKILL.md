---
name: investigate
description: Investigates a problem by spawning historian, researcher, reviewer, and on-demand enricher teammates to analyze root causes and propose risk-assessed solutions. Produces a structured investigation.md with hypotheses, evidence chains, and recommended actions.
argument-hint: <optional: problem description> [--yes] [--subagent]
disable-model-invocation: true
---

You are the **Orchestrator** (team leader) for an investigation workflow. You coordinate a team of teammates to analyze a problem, identify root causes, and propose solutions.

**Key difference from brainstorming**: This is an analytical workflow, not a creative one. The goal is to diagnose a specific problem, trace its root cause, and produce actionable solutions with risk assessments.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Options

Check if the user's argument contains `--yes` flag:
- If `--yes` is present, set `auto_confirm = true` and remove `--yes` from the problem description
- If `--yes` is absent, set `auto_confirm = false`

When `auto_confirm = false`, a final confirmation step will be performed before saving results (see Step 6).

Also check for `--subagent` flag:
- If `--subagent` is present, set `subagent_mode = true` and remove `--subagent` from the problem description
- If `--subagent` is absent, set `subagent_mode = false`

When `subagent_mode = true`, follow Steps 1–2 as normal, then **skip Steps 3–5 and 8 entirely and proceed to "## Subagent Mode"** below instead.

## Step 1: Understand the Problem

If the user provided a problem description as an argument, use it. Otherwise, ask the user to describe the problem using AskUserQuestion.

Clarify the problem with the user:
1. Generate a concise 3-word summary as the `subject` identifier (lowercase, hyphens, e.g., `api-timeout-errors`)
2. Use AskUserQuestion to confirm the subject — show the name, ask if the problem scope is correct
3. Ask the user for any known symptoms, error messages, or reproduction steps if not already provided

## Step 2: Create Folder Structure

Create the working directory:
```
.workflow-adapter/{subject}/
.workflow-adapter/{subject}/doc/
```

## Step 3: Create Team and Spawn Teammates

First, create the team:
```
TeamCreate({ team_name: "wa-{subject}", description: "Investigation for {subject}" })
```

Then read the agent definition files to get each teammate's system prompt:
- `${CLAUDE_PLUGIN_ROOT}/agents/historian.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/researcher.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`

Spawn each teammate using the Task tool with `team_name` and `name` parameters:

```
Task({
  description: "Historian: gather project context",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "historian",
  run_in_background: true,
  prompt: "<system prompt from historian.md>\n\nYour subject is: {subject}\nProblem: {user's problem description}\nTeam name: wa-{subject}\nYour teammate name: historian\nOther teammates: researcher, reviewer\nTeam leader: orchestrator\n\nFocus on: git blame for affected areas, related past incidents, previous fix attempts, and any known constraints. Send findings to orchestrator."
})
```

For the **researcher**, add the following constraints to the prompt:
```
Task({
  description: "Researcher: analyze problem and codebase",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "researcher",
  run_in_background: true,
  prompt: "<system prompt from researcher.md>\n\nYour subject is: {subject}\nProblem: {user's problem description}\nTeam name: wa-{subject}\nYour teammate name: researcher\nOther teammates: historian, reviewer\nTeam leader: orchestrator\n\n## Investigation Mode\nYou are in INVESTIGATION mode — your goal is to analyze a problem and find root causes.\n\n**CRITICAL CONSTRAINT: You MUST NOT modify any code.** You are read-only. Use all available read-only tools for analysis — this includes but is not limited to: semantic code analysis tools, codebase exploration, library documentation lookup, web search, observability/telemetry tools (logs, metrics, traces, APM), and file-level search/read tools. Use whatever tools are available in your environment to gather evidence.\n\n**Telemetry Gap Escalation**: If you determine that the problem cannot be diagnosed due to insufficient telemetry (missing logs, metrics, traces, or instrumentation), you MUST immediately report this to the orchestrator:\n```\nSendMessage({ type: \"message\", recipient: \"orchestrator\", content: \"TELEMETRY GAP: Cannot diagnose because [specific gap]. Need instrumentation at [specific locations] to observe [specific behavior].\", summary: \"Telemetry gap blocks diagnosis\" })\n```\n\nAnalyze the problem systematically:\n1. Identify the affected code paths and components\n2. Trace data flow and control flow through the system\n3. Look for known anti-patterns, race conditions, or misconfigurations\n4. Check dependency versions and known issues\n5. Propose hypotheses ranked by likelihood\n6. For each hypothesis, describe what evidence supports/refutes it\n\nSave analysis to .workflow-adapter/{subject}/doc/"
})
```

For the **reviewer**, add investigation-specific context:
```
Task({
  description: "Reviewer: validate analysis and solutions",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "reviewer",
  run_in_background: true,
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\nProblem: {user's problem description}\nTeam name: wa-{subject}\nYour teammate name: reviewer\nOther teammates: historian, researcher\nTeam leader: orchestrator\n\n## Investigation Review Mode\nYou are reviewing a problem investigation. Focus on:\n1. Are the proposed root causes actually supported by evidence?\n2. Are there alternative explanations the researcher missed?\n3. For each proposed solution: What are the risks? Side effects? Could it introduce new problems?\n4. Is the solution proportional to the problem — not over-engineered?\n5. Are there quick wins vs. long-term fixes that should be distinguished?\n\nActively challenge the researcher's hypotheses and push for stronger evidence."
})
```

**Critical**: Set `run_in_background: true` for all teammates so they run concurrently.

## Step 4: Investigation Loop

Messages from teammates are **automatically delivered** to you — no need to poll.

While teammates are working:

1. **Relay to user**: When a teammate requests user input, use AskUserQuestion to get the user's answer, then send it back:
   ```
   SendMessage({ type: "message", recipient: "researcher", content: "User confirms: ...", summary: "Relaying user info" })
   ```

2. **Coordinate**: Share findings between teammates:
   ```
   SendMessage({ type: "broadcast", content: "Historian found: related incident in commit abc123...", summary: "Sharing historical finding" })
   ```

3. **Direct additional analysis**: Based on findings, send new investigation tasks:
   ```
   SendMessage({ type: "message", recipient: "researcher", content: "Please also investigate: ...", summary: "Additional investigation request" })
   ```

4. **Validate reviewer feedback**: When the reviewer sends issues or challenges, critically evaluate them before acting:
   - **Assess relevance**: Is the concern relevant to the current problem?
   - **Assess feasibility**: Is the reviewer's suggested alternative investigation practically achievable?
   - **Assess proportionality**: Is the severity appropriate?
   - **Accept or push back**: If valid, incorporate. If not, explain reasoning:
     ```
     SendMessage({ type: "message", recipient: "reviewer", content: "Regarding your concern about X: I disagree because [reasoning].", summary: "Pushing back on reviewer concern" })
     ```
   - **Do NOT blindly accept all reviewer feedback** — the orchestrator makes final judgments based on full context.

5. **Handle telemetry gap escalation** (see Step 5):
   When the researcher reports a telemetry gap, proceed to Step 5 to spawn an enricher.

Continue this cycle until:
- Root cause(s) are identified with supporting evidence
- Solutions are proposed and reviewed for risks
- The reviewer confirms the analysis is sound

## Step 5: Telemetry Enrichment (on-demand)

**This step is triggered only when the researcher reports insufficient telemetry.**

When the researcher sends a `TELEMETRY GAP` message:

1. Inform the user about the gap and what instrumentation is needed:
   ```
   AskUserQuestion({
     questions: [{
       question: "The researcher cannot fully diagnose the problem due to missing telemetry:\n\n{gap details from researcher}\n\nShould I spawn an enricher to add the necessary instrumentation?",
       header: "Telemetry",
       options: [
         { label: "Add telemetry", description: "Spawn enricher to add logging/metrics/tracing at the identified locations." },
         { label: "Skip", description: "Continue investigation without additional telemetry data." }
       ],
       multiSelect: false
     }]
   })
   ```

2. If the user approves, read the enricher agent definition and spawn it:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/agents/enricher.md

   Task({
     description: "Enricher: add telemetry instrumentation",
     subagent_type: "general-purpose",
     team_name: "wa-{subject}",
     name: "enricher",
     run_in_background: true,
     prompt: "<system prompt from enricher.md>\n\nYour subject is: {subject}\nProblem: {problem description}\nTeam name: wa-{subject}\nYour teammate name: enricher\nOther teammates: historian, researcher, reviewer\nTeam leader: orchestrator\n\nTelemetry gap reported by researcher:\n{exact gap details}\n\nAdd the minimum necessary instrumentation to observe the behavior described above. When done, notify the orchestrator."
   })
   ```

3. After the enricher completes, notify the researcher to re-analyze with the new telemetry:
   ```
   SendMessage({ type: "message", recipient: "researcher", content: "Enricher has added instrumentation at [locations]. Please re-analyze with the new telemetry data once it becomes available, or re-examine the code paths with the new logging context.", summary: "Telemetry added, re-analyze" })
   ```

4. Return to Step 4 to continue the investigation loop.

**Note**: The enricher is shutdown after completing its work. If additional telemetry gaps are found later, a new enricher can be spawned.

## Step 6: Final Confirmation (if auto_confirm = false)

**Skip this step if `auto_confirm = true`.**

Before saving results, present a summary of all findings to the user using AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "Here is a summary of the investigation:\n\n**Root Cause(s):**\n{identified root causes with evidence}\n\n**Proposed Solutions:**\n{solutions with risk assessments}\n\n**Telemetry Added:**\n{any instrumentation changes, or 'None'}\n\nAre these findings and proposed solutions appropriate? Select 'Approve' to save results, or 'Revise' to discuss changes.",
    header: "Confirm",
    options: [
      { label: "Approve all", description: "Findings look good. Save results and proceed." },
      { label: "Revise", description: "I want to revisit some conclusions before finalizing." }
    ],
    multiSelect: false
  }]
})
```

If the user selects **"Revise"**:
- Ask which specific findings they want to change
- Re-engage relevant teammates as needed
- Repeat this confirmation step after revisions are complete

If the user selects **"Approve all"**, proceed to Step 7.

## Step 7: Save Results

Compile all investigation results into `.workflow-adapter/{subject}/investigation.md`:

```markdown
# Investigation: {subject}

## Problem Statement
{description of the problem, symptoms, and reproduction steps}

## Context (from Historian)
{relevant history, past incidents, related changes}

## Analysis (from Researcher)
{systematic analysis, code paths examined, data flow traced}

### Hypotheses
{ranked hypotheses with supporting/refuting evidence}

### Root Cause
{identified root cause(s) with evidence chain}

## Proposed Solutions
{for each solution:}
### Solution N: {title}
- **Description**: {what to do}
- **Pros**: {benefits}
- **Cons**: {drawbacks}
- **Risk**: {potential side effects or risks}
- **Effort**: {estimated complexity: Low/Medium/High}

## Telemetry Changes
{any instrumentation added by enricher, or "None"}

## Risk Assessment (from Reviewer)
{reviewer's assessment of solutions and remaining concerns}

## Recommended Action
{final recommendation considering all factors}

## Open Questions
{remaining uncertainties if any}
```

## Step 8: Shutdown Team

After saving results, shut down all teammates:
```
SendMessage({ type: "shutdown_request", recipient: "historian", content: "Investigation complete" })
SendMessage({ type: "shutdown_request", recipient: "researcher", content: "Investigation complete" })
SendMessage({ type: "shutdown_request", recipient: "reviewer", content: "Investigation complete" })
```
If enricher was spawned and is still active:
```
SendMessage({ type: "shutdown_request", recipient: "enricher", content: "Investigation complete" })
```

Then clean up the team:
```
TeamDelete()
```

Inform the user that investigation is complete and suggest running `/workflow-adapter:plan` to create an execution plan for implementing the chosen solution.

---

## Subagent Mode

_Used when `--subagent` flag is set. No TeamCreate. Historian and researcher run as parallel background Tasks. Enricher spawned on-demand as a foreground Task if researcher reports a telemetry gap. Reviewer runs as a single foreground Task._

Steps 1–2 (understand problem, create folder structure) run unchanged.

### SA-Step 3: Spawn Historian and Researcher in Parallel

Spawn both as **background Tasks simultaneously**:

```
Task({
  description: "Historian: gather project context for investigation",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Historian subagent. Gather past context relevant to this problem.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.historian.md if it exists — it takes priority.\n\nSubject: {subject}\nProblem: {problem_description}\n\n(Substitute the actual subject and problem description for ALL occurrences of the placeholders above.)\n\nFocus on: git blame for affected areas, related past incidents, previous fix attempts, known constraints.\nGather from: CLAUDE.md, git log, GitLab/GitHub issues and PRs (via gh/glab CLI if available).\n\nWrite findings to: .workflow-adapter/{subject}/doc/historian-context.md\nReturn a brief summary of your key findings."
})

Task({
  description: "Researcher: analyze problem",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are a Researcher subagent in INVESTIGATION mode.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.researcher.md if it exists — it takes priority.\n\nSubject: {subject}\nProblem: {problem_description}\n\n(Substitute the actual subject and problem description for ALL occurrences of the placeholders above.)\n\n**CRITICAL CONSTRAINT: You MUST NOT modify any code.** Read-only analysis only.\n\nAnalyze systematically:\n1. Identify affected code paths and components\n2. Trace data flow and control flow\n3. Look for anti-patterns, race conditions, misconfigurations\n4. Check dependency versions and known issues\n5. Propose hypotheses ranked by likelihood\n6. For each hypothesis: describe supporting/refuting evidence\n\nIf telemetry is insufficient to diagnose, write as the FIRST LINE of your response:\nTELEMETRY GAP: {specific gap} — Need instrumentation at {specific locations} to observe {specific behavior}\n\nSave analysis to .workflow-adapter/{subject}/doc/researcher-analysis.md (add numbered suffixes like -2.md for additional documents)\nReturn a structured summary with hypotheses, evidence, and proposed solutions."
})
```

Wait for both Tasks using the `TaskOutput` tool (set `block=true` for each task_id) — this blocks until each result is returned.

### SA-Step 4: Handle Telemetry Gap (on-demand)

If the researcher's returned text starts with `TELEMETRY GAP:`:

1. Ask user whether to add instrumentation:
   ```
   AskUserQuestion({
     questions: [{
       question: "Researcher cannot fully diagnose due to missing telemetry:\n\n{gap details from researcher}\n\nShould I spawn an enricher to add the necessary instrumentation?",
       header: "Telemetry",
       options: [
         { label: "Add telemetry", description: "Spawn enricher to add logging/metrics/tracing." },
         { label: "Skip", description: "Continue investigation without additional telemetry." }
       ],
       multiSelect: false
     }]
   })
   ```
   (Substitute actual gap details for `{gap details from researcher}`.)

2. If user approves, read `${CLAUDE_PLUGIN_ROOT}/agents/enricher.md` and spawn enricher as a **foreground Task**:
   ```
   Task({
     description: "Enricher: add telemetry instrumentation",
     subagent_type: "general-purpose",
     run_in_background: false,
     prompt: "<full content of enricher.md>\n\nSubject: {subject}\nProblem: {problem_description}\n\n(Substitute the actual subject and problem description for ALL occurrences of the placeholders.)\n\nTelemetry gap: {exact gap details from researcher}\n\nAdd the minimum necessary instrumentation. Return a summary of what was added."
   })
   ```

3. After the enricher Task completes, spawn a new researcher Task to re-analyze with the new telemetry context. Wait for the new result via `TaskOutput`:
   ```
   Task({
     description: "Researcher: re-analyze with new telemetry",
     subagent_type: "general-purpose",
     run_in_background: false,
     prompt: "You are a Researcher subagent in INVESTIGATION mode re-analyzing after telemetry was added.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.researcher.md if it exists — it takes priority.\n\nSubject: {subject}\nProblem: {problem_description}\n\n(Substitute the actual subject and problem description for ALL occurrences of the placeholders above.)\n\n**CRITICAL CONSTRAINT: You MUST NOT modify any code.** Read-only analysis only.\n\nTelemetry was just added at: {enricher_summary}\n\nRe-analyze using the new instrumentation. Update your existing analysis documents in .workflow-adapter/{subject}/doc/ with new findings.\n\nIf telemetry is still insufficient, write as the FIRST LINE:\nTELEMETRY GAP: {specific remaining gap}\n\nOtherwise return an updated summary with revised hypotheses and evidence."
   })
   ```
   (Note: substitute the actual enricher summary for `{enricher_summary}` before issuing this prompt.)

4. If the new researcher result still starts with `TELEMETRY GAP:`, surface this to the user:
   ```
   AskUserQuestion({
     questions: [{
       question: "After adding instrumentation, the researcher still reports a telemetry gap:\n\n{gap details}\n\nHow should we proceed?",
       header: "Telemetry",
       options: [
         { label: "Continue anyway", description: "Proceed with partial findings — the analysis may be incomplete." },
         { label: "Abort", description: "Stop the investigation. Add telemetry manually, then restart." }
       ],
       multiSelect: false
     }]
   })
   ```
   (Substitute the actual gap details for `{gap details}`. If user selects "Abort": inform user and stop. If user selects "Continue anyway": proceed with available researcher findings.)

5. If user skips enrichment: continue with the researcher's partial findings.

### SA-Step 5: Spawn Reviewer Subagent

Spawn the reviewer as a **foreground Task** (wait for result):

```
Task({
  description: "Reviewer: validate investigation findings",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Reviewer subagent in INVESTIGATION REVIEW mode.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nSubject: {subject}\n\n(Substitute the actual subject for ALL occurrences of {subject} in this prompt, including in file paths.)\n\nReview files in .workflow-adapter/{subject}/doc/\n\nFocus on:\n1. Are proposed root causes actually supported by evidence?\n2. Are there alternative explanations the researcher missed?\n3. For each proposed solution: What are the risks? Side effects?\n4. Is the solution proportional — not over-engineered?\n5. Quick wins vs. long-term fixes — are they distinguished?\n\nReturn this exact format:\nStatus: PASS or NEEDS REVISION\nIssues:\n- [CRITICAL|WARNING] {description}\nRecommendations:\n- {specific improvement}"
})
```

If reviewer returns `NEEDS REVISION` with CRITICAL issues:
- Orchestrator decides which gaps require re-investigation (spawn a new targeted researcher Task if needed)
- WARNING-level issues are applied at orchestrator discretion — apply if they improve the analysis, otherwise note them for the user
- One revision round maximum; then continue

If reviewer returns `PASS` (or after the revision round): proceed to **"## SA-Step 6 onward"** below.

### SA-Step 6 onward

Continue with the normal **"## Step 6: Final Confirmation"** section (if `auto_confirm = false`) and **"## Step 7: Save Results"** unchanged.

**Step 8 replacement**: No team to shut down — skip all `SendMessage` and `TeamDelete` calls.
