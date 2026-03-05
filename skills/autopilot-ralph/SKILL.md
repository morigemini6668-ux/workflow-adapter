---
name: autopilot-ralph
description: This skill should be used when the user asks to "autopilot ralph", "autopilot-ralph", "자동 루프", "문제 해결 루프", "autopilot loop", "알아서 고쳐줘", "루프 돌면서 해결해줘", "자동으로 해결", "keep fixing until done", or wants an autonomous problem-solving loop that first clarifies the problem and verification method via interactive Q&A, then iterates Analyze-Execute-Verify until resolved.
argument-hint: "<subject> [--max-iterations N] [--copilot] [--copilot-model MODEL]"
disable-model-invocation: true
---

# Autopilot Ralph

Autonomous problem-solving loop: clarify the problem interactively, then iterate **Analyze → Execute → Verify** until resolved or max iterations reached.

Unlike `ralph-execute` (requires plan.md) or `ralph-debug` (bug-specific), this skill handles **any type of task** — code changes, refactoring, configuration, infrastructure, etc. — without requiring a pre-built plan.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Arguments

Extract from the skill arguments:
- `subject` (required) — a short name for this session (e.g., `auth-refactor`, `ci-fix`)
- `--max-iterations N` (optional) — maximum loop iterations; default is `10`
- `--copilot` (optional) — delegate Analyzer, Executor, and Verifier roles to Copilot CLI instead of Claude subagents
- `--copilot-model MODEL` (optional) — model for Copilot CLI; default is `gpt-5.3-codex`

If `--copilot` is present, set `copilot_mode = true` and remove it from the subject name.

If no subject is provided, check `.workflow-adapter/` for exactly one folder containing both a `ralph-state.md` with `type: autopilot` and an `autopilot-target.md`. If found, offer to resume. If zero or multiple found, use AskUserQuestion to ask for the subject name.

## Step 1: Check Existing State

Check whether `.workflow-adapter/{subject}/ralph-state.md` exists.

**If it DOES exist:**
- Read it. If it contains `type: autopilot`, this is a resume or leftover from a previous autopilot session.
- If the frontmatter contains `copilot_mode: true`, set `copilot_mode = true` and read `copilot_model` from frontmatter (preserves mode across re-injections).
- Use AskUserQuestion: "A previous autopilot-ralph session exists for `{subject}`. Resume or start fresh?"
- If resume: skip to Step 3. If fresh: delete `ralph-state.md` and `autopilot-target.md`, then proceed to Step 2.
- If the state file does NOT contain `type: autopilot` (may be execute or debug): warn the user and stop.

**If it does NOT exist:** proceed to Step 2.

## Step 2: Gather Context via Interactive Q&A

Use AskUserQuestion to collect the following, one question at a time:

**Question 1 — Problem description:**
"해결하고 싶은 문제가 무엇인가요? 구체적으로 설명해주세요. (What problem do you want to solve? Describe it concretely.)"

**Question 2 — Desired outcome:**
"완료되었을 때 어떤 상태여야 하나요? (What should the result look like when done?)"

**Question 3 — Verification method:**
"결과를 어떻게 검증하나요? 실행 가능한 커맨드나 확인 방법을 알려주세요. (How do we verify success? Provide a shell command or describe the check.)"
- Examples: `bun test`, `npm run build`, `curl -f localhost:3000/health`, or a description like "All TypeScript errors resolved and build passes"

After collecting all three answers, create the session files:

**Create the subject directory:**
```bash
mkdir -p ".workflow-adapter/{subject}"
```

**Write `.workflow-adapter/{subject}/autopilot-target.md`:**
```markdown
# Autopilot Target: {subject}

## Problem Description
{user's problem description}

## Desired Outcome
{user's desired outcome}

## Verification Method
{user's verification method}

## Iteration History
(empty — first iteration)
```

**Get the current timestamp** via Bash:
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

**Write `.workflow-adapter/{subject}/ralph-state.md`** using Write tool, substituting actual values (include `copilot_mode` and `copilot_model` lines only if `copilot_mode = true`):
```markdown
---
iteration: 0
max_iterations: {N}
completion_promise: "ALL JOB COMPLETE"
subject: {subject}
started_at: "{timestamp}"
type: autopilot
copilot_mode: true          # only if --copilot flag was set
copilot_model: "{copilot_model}"  # only if --copilot flag was set
---

You are the Autopilot-Ralph orchestrator for subject '{subject}'. Continue the problem-solving loop.

Read .workflow-adapter/{subject}/autopilot-target.md for: problem description, desired outcome, verification method, and the ## Iteration History of all previous attempts.

Execute this iteration (N = current iteration number from frontmatter):
1. ANALYZE: Spawn a foreground analyzer subagent.
   - Read autopilot-target.md's ## Iteration History — do NOT repeat previously failed approaches.
   - Write analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md
   - Return only: "Analysis complete: iter-{N}-analysis.md"
2. EXECUTE: Spawn a foreground executor subagent.
   - Read .workflow-adapter/{subject}/iter-{N}-analysis.md for the plan.
   - Implement the changes. Be thorough but surgical.
   - Write execution summary to .workflow-adapter/{subject}/iter-{N}-execution.md
   - Return only: "Execution complete: {files changed} — {one-line description}"
3. VERIFY: Spawn a foreground verifier subagent.
   - Read .workflow-adapter/{subject}/iter-{N}-execution.md for what was changed.
   - Run the verification method from autopilot-target.md exactly.
   - Append results to ## Iteration History in autopilot-target.md directly.
   - Return only: "PASS" or "FAIL: {one-sentence reason}"
4. COMPLETE:
   - If verifier returns PASS: output <promise>ALL JOB COMPLETE</promise>
   - If verifier returns FAIL: output a status summary. Stop hook will re-inject this prompt for the next iteration.
```

## Step 3: Spawn Analyzer

**If `copilot_mode = false` (default):**

Spawn a **foreground** analyzer subagent:

```
Task({
  description: "Analyzer: plan the approach for this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are an Analyzer subagent. Plan the approach to solve the problem.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Target file: .workflow-adapter/{subject}/autopilot-target.md
- Read it fully — problem, desired outcome, verification method, and all entries in ## Iteration History.

Analysis process:
1. Read autopilot-target.md completely.
2. Examine relevant code/config in the repository related to the problem area.
3. Consult ## Iteration History — identify which approaches were already tried and failed.
4. Form a concrete, actionable plan with specific files and changes.
5. If previous iterations exist, the plan MUST differ from what was already tried.

Write your analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md in this format:
## Analysis
- Problem understanding: {concise summary}
- Previous attempts: {what was tried and why it failed, or 'None' if first iteration}

## Plan
1. {specific action — file:function or file:line}
2. {specific action}
3. ...

## Expected Outcome
{what should change after execution}

Then output ONLY this one line: Analysis complete: iter-{N}-analysis.md"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run these steps yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

```
Task({
  description: "Copilot analyzer: plan approach for this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run copilot-exec.ts via Bash, (3) report the result.

Subject: {subject}
Copilot model: {copilot_model}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-analyzer.md with this exact content:

You are an Analyzer. Plan the approach to solve the problem.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Target file: .workflow-adapter/{subject}/autopilot-target.md
Read it fully — problem, desired outcome, verification method, and all entries in ## Iteration History.

Analysis process:
1. Read autopilot-target.md completely.
2. Examine relevant code/config in the repository related to the problem area.
3. Consult ## Iteration History — identify which approaches were already tried and failed.
4. Form a concrete, actionable plan with specific files and changes.
5. If previous iterations exist, the plan MUST differ from what was already tried.

Write your analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md in this format:
## Analysis
- Problem understanding: {concise summary}
- Previous attempts: {what was tried and why it failed, or 'None' if first iteration}

## Plan
1. {specific action — file:function or file:line}
2. {specific action}
3. ...

## Expected Outcome
{what should change after execution}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '.workflow-adapter/{subject}/prompt-analyzer.md' --model '{copilot_model}' --timeout 600

3. Verify .workflow-adapter/{subject}/iter-{N}-analysis.md was created.
Output ONLY: Analysis complete: iter-{N}-analysis.md
</copilot-dispatcher-prompt>"
})
```

Wait for the analyzer to complete before proceeding.

## Step 4: Spawn Executor

**If `copilot_mode = false` (default):**

Spawn a **foreground** executor subagent:

```
Task({
  description: "Executor: implement the planned changes",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are an Executor subagent. Implement the planned changes.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Target: .workflow-adapter/{subject}/autopilot-target.md — read for problem and desired outcome.
- Plan: .workflow-adapter/{subject}/iter-{N}-analysis.md — read for the specific actions to take.

Execution process:
1. Read iter-{N}-analysis.md to get the plan.
2. Implement each action in the plan precisely.
3. Do not refactor or improve unrelated code.
4. After applying changes, verify they are syntactically correct.

Write an execution summary to .workflow-adapter/{subject}/iter-{N}-execution.md in this format:
## Changes Applied
- File: {path} — {what was changed and why}
- File: {path} — {what was changed and why}

## Plan Item Coverage
- [x] {plan item 1}
- [x] {plan item 2}
- [ ] {plan item skipped — reason}

## Notes
{any caveats or observations}

Then output ONLY this one line: Execution complete: {files changed} — {one-line description}"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run these steps yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

```
Task({
  description: "Copilot executor: implement planned changes",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run copilot-exec.ts via Bash, (3) report the result.

Subject: {subject}
Copilot model: {copilot_model}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-executor.md with this exact content:

You are an Executor. Implement the planned changes.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Context:
- Target: .workflow-adapter/{subject}/autopilot-target.md — read for problem and desired outcome.
- Plan: .workflow-adapter/{subject}/iter-{N}-analysis.md — read for the specific actions to take.

Execution process:
1. Read iter-{N}-analysis.md to get the plan.
2. Implement each action in the plan precisely.
3. Do not refactor or improve unrelated code.
4. After applying changes, verify they are syntactically correct.

Write an execution summary to .workflow-adapter/{subject}/iter-{N}-execution.md in this format:
## Changes Applied
- File: {path} — {what was changed and why}
- File: {path} — {what was changed and why}

## Plan Item Coverage
- [x] {plan item 1}
- [x] {plan item 2}
- [ ] {plan item skipped — reason}

## Notes
{any caveats or observations}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '.workflow-adapter/{subject}/prompt-executor.md' --model '{copilot_model}' --timeout 600

3. Verify .workflow-adapter/{subject}/iter-{N}-execution.md was created.
Output ONLY: Execution complete: {files changed} — {one-line description}
</copilot-dispatcher-prompt>"
})
```

Wait for the executor to complete before proceeding.

## Step 5: Spawn Verifier

**If `copilot_mode = false` (default):**

Spawn a **foreground** verifier subagent:

```
Task({
  description: "Verifier: confirm whether the changes resolve the problem",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Verifier subagent. Confirm whether the applied changes resolve the problem.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Target: .workflow-adapter/{subject}/autopilot-target.md — read for desired outcome and verification method.
- Execution details: .workflow-adapter/{subject}/iter-{N}-execution.md — read for what was changed.

Verification process:
1. Read autopilot-target.md for the desired outcome and verification method.
2. Read iter-{N}-execution.md for what was changed this iteration.
3. Execute the verification method:
   - If it is a shell command: run it with Bash, capture exit code and full stdout/stderr.
   - If it is a behavioral description: test the described behavior using available tools.
4. Compare the result against the desired outcome.
5. Append this entry to the ## Iteration History section in autopilot-target.md:

### Iteration {N} — {PASS|FAIL}
- **Approach**: {summary from iter-{N}-analysis.md}
- **Changes**: {summary from iter-{N}-execution.md}
- **Verification**: {method used} → {PASS|FAIL}
- **Evidence**: {key output line or observation}

Then output ONLY this one line: PASS
or: FAIL: {one-sentence reason}"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: You (the orchestrator) MUST use the Agent/Task tool to spawn a subagent. Do NOT run these steps yourself. The entire content below is the subagent's prompt — pass it verbatim to the Task tool's `prompt` field.**

```
Task({
  description: "Copilot verifier: confirm changes resolve problem",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job is to: (1) write a prompt file, (2) run copilot-exec.ts via Bash, (3) report the result.

Subject: {subject}
Copilot model: {copilot_model}

Do these steps in order:

1. Use the Write tool to create .workflow-adapter/{subject}/prompt-verifier.md with this exact content:

You are a Verifier. Confirm whether the applied changes resolve the problem.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Context:
- Target: .workflow-adapter/{subject}/autopilot-target.md — read for desired outcome and verification method.
- Execution details: .workflow-adapter/{subject}/iter-{N}-execution.md — read for what was changed.

Verification process:
1. Read autopilot-target.md for the desired outcome and verification method.
2. Read iter-{N}-execution.md for what was changed this iteration.
3. Execute the verification method:
   - If it is a shell command: run it, capture exit code and full stdout/stderr.
   - If it is a behavioral description: test the described behavior.
4. Compare the result against the desired outcome.
5. Append this entry to the ## Iteration History section in autopilot-target.md:

### Iteration {N} — {PASS|FAIL}
- **Approach**: {summary from iter-{N}-analysis.md}
- **Changes**: {summary from iter-{N}-execution.md}
- **Verification**: {method used} → {PASS|FAIL}
- **Evidence**: {key output line or observation}

2. Use the Bash tool to run:
bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '.workflow-adapter/{subject}/prompt-verifier.md' --model '{copilot_model}' --timeout 600

3. Read the updated ## Iteration History in autopilot-target.md to check the result.
Output ONLY: PASS or FAIL: {one-sentence reason}
</copilot-dispatcher-prompt>"
})
```

Wait for the verifier to complete.

## Step 6: Completion Check

**If the verifier returned `PASS`:**
- Output exactly:
  ```
  <promise>ALL JOB COMPLETE</promise>
  ```
  The Stop hook will detect this tag, remove `ralph-state.md`, and allow the session to end normally.

**If the verifier returned `FAIL`:**
- Output a status summary:
  ```
  Autopilot iteration {N}/{max_iterations} complete. Problem not yet resolved.
  Approach tried: {summary}
  Changes: {what was changed}
  Verification failure: {reason from verifier}
  Next iteration will attempt a different approach based on Iteration History.
  ```
  The Stop hook will re-inject the prompt in `ralph-state.md` to continue the loop with a new iteration.

**Edge Cases:**
- **Max iterations reached**: The Stop hook handles termination automatically when `iteration >= max_iterations`. Output the status summary as above.
- **Verifier cannot run the command**: The verifier should output `FAIL` with a clear error. The next iteration's analyzer should treat the environment issue as part of the context.
- **All approaches exhausted**: The analyzer should indicate this explicitly. Report exhaustion in the status summary.

## Cancellation

Cancel with `/workflow-adapter:ralph-cancel {subject}` to remove the state file and stop the loop.
