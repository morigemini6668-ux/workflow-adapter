---
name: ralph-debug
description: This skill should be used when the user asks to "ralph debug", "debug this in a loop", "auto-fix this bug", "iterative debugging loop", "ralph-debug", "반복 디버깅", "자동 디버깅 루프", "루프로 버그 고쳐줘", "버그 자동 수정", or wants to run an automated root cause analysis → fix → verify loop that keeps iterating until a bug is resolved or max iterations is reached.
argument-hint: "<subject> [--max-iterations N] [--copilot] [--copilot-model MODEL]"
disable-model-invocation: true
---

You are the **Ralph-Debug Orchestrator** running an iterative debug loop:
**Analyze root cause → Apply fix → Verify** — repeat until resolved.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Arguments

Extract from the skill arguments:
- `subject` (required) — a short name for this debug session (e.g., `login-bug`, `api-timeout`)
- `--max-iterations N` (optional) — maximum loop iterations before stopping; default is `5`
- `--copilot` (optional) — delegate Analyzer, Fixer, and Verifier roles to Copilot CLI instead of Claude subagents
- `--copilot-model MODEL` (optional) — model for Copilot CLI; default is `gpt-5.3-codex`

If `--copilot` is present, set `copilot_mode = true` and remove it from the subject name.

If no subject is provided, check `.workflow-adapter/` for exactly one folder containing both a `ralph-state.md` and a `debug-target.md`. If found, offer to resume it. If zero or multiple found, use AskUserQuestion to ask for the subject name.

## Step 1: Check Existing State

Check whether `.workflow-adapter/{subject}/ralph-state.md` exists.

**If it DOES exist:**
- Read it. If it contains `type: debug`, this is a resume or leftover from a previous ralph-debug session.
- If the frontmatter contains `copilot_mode: true`, set `copilot_mode = true` and read `copilot_model` from frontmatter (preserves mode across re-injections).
- Use AskUserQuestion: "A `ralph-debug-state.md` already exists for subject `{subject}`. Resume the existing debug loop, or cancel it and start fresh?"
- If resume: skip to Step 3 (re-run the loop directly). If fresh: delete `ralph-state.md` and `debug-target.md`, then proceed to Step 2.
- If the state file does NOT contain `type: debug` (it may be a ralph-execute state): warn the user and stop.

**If it does NOT exist:** proceed to Step 2.

## Step 2: Gather Debug Context (First Run Only)

**Always ask the user before creating any files.** Use AskUserQuestion to collect:

**Question 1 — Problem description:**
"무슨 문제를 디버깅하나요? (What bug or unexpected behavior are we fixing?)"

**Question 2 — Desired state (원하는 상태):**
"디버깅이 성공했을 때 어떤 상태여야 하나요? (What should the system look like or do when the fix works?)"

**Question 3 — Verification method (검증 방법):**
"고쳐진 걸 어떻게 확인하나요? 검증 커맨드나 방법을 알려주세요. (How do we verify the fix? Provide a shell command or describe the observable check.)"
- Examples: `bun test src/auth`, `npm run test`, `curl -f localhost:3000/health`, or a description like "App starts without crashing and logs 'Server ready'"

After collecting all three answers, create the debug session files:

**Create the subject directory:**
```bash
mkdir -p ".workflow-adapter/{subject}"
```

**Write `.workflow-adapter/{subject}/debug-target.md`:**
```markdown
# Debug Target: {subject}

## Problem Description
{user's problem description}

## Desired State (원하는 상태)
{user's desired state}

## Verification Method (검증 방법)
{user's verification method}

## Debug History
(empty — first iteration)
```

**Get the current timestamp** via Bash first:
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

**Write `.workflow-adapter/{subject}/ralph-state.md`** using Write tool, substituting `{subject}`, `{N}`, and `{timestamp}` with actual values (include `copilot_mode` and `copilot_model` lines only if `copilot_mode = true`):
```markdown
---
iteration: 0
max_iterations: {N}
completion_promise: "ALL JOB COMPLETE"
subject: {subject}
started_at: "{timestamp}"
type: debug
copilot_mode: true          # only if --copilot flag was set
copilot_model: "{copilot_model}"  # only if --copilot flag was set
---

You are the Ralph-Debug orchestrator for subject '{subject}'. Continue the debug loop.

Read .workflow-adapter/{subject}/debug-target.md for: problem description, desired state, verification method, and the ## Debug History of all previous attempts.

Execute this iteration (N = current iteration number from frontmatter):
1. ANALYZE: Spawn a foreground root-cause analyzer subagent.
   - Read debug-target.md's ## Debug History — do NOT repeat previously failed fixes.
   - Write full analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md
   - Return only: "Analysis complete: iter-{N}-analysis.md"
2. FIX: Spawn a foreground fixer subagent.
   - Read .workflow-adapter/{subject}/iter-{N}-analysis.md for root cause and recommended fix.
   - Be surgical — change only what is necessary.
   - Write fix summary to .workflow-adapter/{subject}/iter-{N}-fix.md
   - Return only: "Fix applied: {file} — {one-line description}"
3. VERIFY: Spawn a foreground verifier subagent.
   - Read .workflow-adapter/{subject}/iter-{N}-fix.md for what was changed.
   - Run the verification method from debug-target.md exactly.
   - Append results to ## Debug History in debug-target.md directly.
   - Return only: "PASS" or "FAIL: {one-sentence reason}"
4. COMPLETE:
   - If verifier returns PASS: output <promise>ALL JOB COMPLETE</promise>
   - If verifier returns FAIL: output a status summary. Stop hook will re-inject this prompt for the next iteration.
```

## Step 3: Spawn Root Cause Analyzer

**If `copilot_mode = false` (default):**

Spawn a **foreground** root-cause analyzer subagent:

```
Task({
  description: "Analyzer: identify root cause of the bug",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Root Cause Analyzer. Identify why a bug exists.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Debug target file: .workflow-adapter/{subject}/debug-target.md
- Read it fully — understand the problem, desired state, verification method, and all entries in ## Debug History.

Analysis process:
1. Read debug-target.md completely — problem, desired state, verification method, and ## Debug History.
2. Examine all relevant code in the repository related to the problem area.
3. Consult ## Debug History — identify which root causes and fixes were already tried and failed.
4. Form 2-3 NEW hypotheses (not previously attempted), ranked by likelihood.
5. For each hypothesis: pinpoint the exact file, line, and function.

Write your full analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md in this format:
Root Cause Analysis:
- Hypothesis 1 (HIGH confidence): {description} — {file:line}
- Hypothesis 2 (MEDIUM confidence): {description} — {file:line}
- Hypothesis 3 (LOW confidence): {description} — {file:line}

Recommended Fix: {specific, actionable fix for Hypothesis 1}

Then output ONLY this one line: Analysis complete: iter-{N}-analysis.md"
})
```

**If `copilot_mode = true`:**

Spawn a **foreground Copilot analyzer Task**:

```
Task({
  description: "Copilot analyzer: identify root cause",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Copilot dispatcher for root cause analysis. Write a prompt file and run Copilot CLI.

Subject: {subject}
Copilot model: {copilot_model}

Step 1: Write the prompt file to .workflow-adapter/{subject}/prompt-analyzer.md using the Write tool:

---
You are a Root Cause Analyzer. Identify why a bug exists.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Debug target file: .workflow-adapter/{subject}/debug-target.md
Read it fully — problem, desired state, verification method, and all entries in ## Debug History.

Analysis process:
1. Read debug-target.md completely.
2. Examine all relevant code in the repository related to the problem area.
3. Consult ## Debug History — identify which root causes and fixes were already tried and failed.
4. Form 2-3 NEW hypotheses (not previously attempted), ranked by likelihood.
5. For each hypothesis: pinpoint the exact file, line, and function.

Write your full analysis to .workflow-adapter/{subject}/iter-{N}-analysis.md in this format:
Root Cause Analysis:
- Hypothesis 1 (HIGH confidence): {description} — {file:line}
- Hypothesis 2 (MEDIUM confidence): {description} — {file:line}
- Hypothesis 3 (LOW confidence): {description} — {file:line}

Recommended Fix: {specific, actionable fix for Hypothesis 1}
---

Step 2: Run Copilot CLI via Bash:
bash '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.sh' --prompt-file '.workflow-adapter/{subject}/prompt-analyzer.md' --model '{copilot_model}' --timeout 600

Step 3: Verify .workflow-adapter/{subject}/iter-{N}-analysis.md was created.
Output ONLY: Analysis complete: iter-{N}-analysis.md"
})
```

Wait for the analyzer to complete before proceeding.

## Step 4: Spawn Fixer

**If `copilot_mode = false` (default):**

Spawn a **foreground** fixer subagent using the analyzer's output:

```
Task({
  description: "Fixer: apply the fix based on root cause analysis",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Fixer subagent. Apply a surgical fix to resolve the bug.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Debug target: .workflow-adapter/{subject}/debug-target.md — read for problem and desired state.
- Root cause analysis: .workflow-adapter/{subject}/iter-{N}-analysis.md — read for hypotheses and recommended fix.

Fix process:
1. Read iter-{N}-analysis.md to get the recommended fix.
2. Implement the fix exactly. Be surgical — change only what is necessary.
3. Do not refactor or improve unrelated code.
4. After applying the fix, verify the change is syntactically correct.

Write a fix summary to .workflow-adapter/{subject}/iter-{N}-fix.md in this format:
Fix Applied:
- File: {path}
- Change: {description of what was changed and why}
- Root Cause Addressed: {which hypothesis from analysis}
- Notes: {any caveats or follow-up needed}

Then output ONLY this one line: Fix applied: {file} — {one-line description}"
})
```

**If `copilot_mode = true`:**

Spawn a **foreground Copilot fixer Task**:

```
Task({
  description: "Copilot fixer: apply fix based on analysis",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Copilot dispatcher for fixing. Write a prompt file and run Copilot CLI.

Subject: {subject}
Copilot model: {copilot_model}

Step 1: Write the prompt file to .workflow-adapter/{subject}/prompt-fixer.md using the Write tool:

---
You are a Fixer. Apply a surgical fix to resolve the bug.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Context:
- Debug target: .workflow-adapter/{subject}/debug-target.md — read for problem and desired state.
- Root cause analysis: .workflow-adapter/{subject}/iter-{N}-analysis.md — read for hypotheses and recommended fix.

Fix process:
1. Read iter-{N}-analysis.md to get the recommended fix.
2. Implement the fix exactly. Be surgical — change only what is necessary.
3. Do not refactor or improve unrelated code.
4. After applying the fix, verify the change is syntactically correct.

Write a fix summary to .workflow-adapter/{subject}/iter-{N}-fix.md in this format:
Fix Applied:
- File: {path}
- Change: {description of what was changed and why}
- Root Cause Addressed: {which hypothesis from analysis}
- Notes: {any caveats or follow-up needed}
---

Step 2: Run Copilot CLI via Bash:
bash '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.sh' --prompt-file '.workflow-adapter/{subject}/prompt-fixer.md' --model '{copilot_model}' --timeout 600

Step 3: Verify .workflow-adapter/{subject}/iter-{N}-fix.md was created.
Output ONLY: Fix applied: {file} — {one-line description}"
})
```

Wait for the fixer to complete before proceeding.

## Step 5: Spawn Verifier

**If `copilot_mode = false` (default):**

Spawn a **foreground** verifier subagent:

```
Task({
  description: "Verifier: confirm whether the fix resolves the bug",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Verifier subagent. Confirm whether the applied fix resolves the bug.

Before starting:
1. Check .workflow-adapter/principle.md if it exists — follow it.

Context:
- Debug target: .workflow-adapter/{subject}/debug-target.md — read for desired state and verification method.
- Fix details: .workflow-adapter/{subject}/iter-{N}-fix.md — read for what was changed.

Verification process:
1. Read debug-target.md for the desired state and verification method.
2. Read iter-{N}-fix.md for what was changed this iteration.
3. Execute the verification method:
   - If it is a shell command: run it with Bash, capture exit code and full stdout/stderr.
   - If it is a behavioral description: test the described behavior using available tools.
4. Compare the result against the desired state.
5. Append this entry to the ## Debug History section in debug-target.md:

### Iteration {N} — {PASS|FAIL}
- **Root Cause Tried**: {hypothesis from iter-{N}-analysis.md}
- **Fix Applied**: {summary from iter-{N}-fix.md}
- **Verification**: {method used} → {PASS|FAIL}
- **Evidence**: {key output line or observation}

Then output ONLY this one line: PASS
or: FAIL: {one-sentence reason}"
})
```

**If `copilot_mode = true`:**

Spawn a **foreground Copilot verifier Task**:

```
Task({
  description: "Copilot verifier: confirm fix resolves the bug",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Copilot dispatcher for verification. Write a prompt file and run Copilot CLI.

Subject: {subject}
Copilot model: {copilot_model}

Step 1: Write the prompt file to .workflow-adapter/{subject}/prompt-verifier.md using the Write tool:

---
You are a Verifier. Confirm whether the applied fix resolves the bug.

Before starting, read .workflow-adapter/principle.md if it exists and follow it.

Context:
- Debug target: .workflow-adapter/{subject}/debug-target.md — read for desired state and verification method.
- Fix details: .workflow-adapter/{subject}/iter-{N}-fix.md — read for what was changed.

Verification process:
1. Read debug-target.md for the desired state and verification method.
2. Read iter-{N}-fix.md for what was changed this iteration.
3. Execute the verification method:
   - If it is a shell command: run it, capture exit code and full stdout/stderr.
   - If it is a behavioral description: test the described behavior.
4. Compare the result against the desired state.
5. Append this entry to the ## Debug History section in debug-target.md:

### Iteration {N} — {PASS|FAIL}
- **Root Cause Tried**: {hypothesis from iter-{N}-analysis.md}
- **Fix Applied**: {summary from iter-{N}-fix.md}
- **Verification**: {method used} → {PASS|FAIL}
- **Evidence**: {key output line or observation}
---

Step 2: Run Copilot CLI via Bash:
bash '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.sh' --prompt-file '.workflow-adapter/{subject}/prompt-verifier.md' --model '{copilot_model}' --timeout 600

Step 3: Read the updated ## Debug History in debug-target.md to check the result.
Output ONLY: PASS or FAIL: {one-sentence reason}"
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
- Output a status summary in this format:
  ```
  Debug iteration {N}/{max_iterations} complete. Fix did not resolve the bug.
  Root cause tried: {hypothesis summary}
  Fix: {what was changed}
  Verification failure: {reason from verifier}
  Next iteration will attempt a different approach based on Debug History.
  ```
  The Stop hook will re-inject the prompt in `ralph-state.md` to continue the loop with a new iteration.

**Edge Cases:**

- **Max iterations reached without PASS**: The Stop hook handles termination automatically when `iteration >= max_iterations`. Output the status summary as above — the hook will read the state file and stop the loop cleanly.
- **Verifier cannot run the command** (command not found, environment issue): The verifier should output `FAIL` with a clear error. The next iteration's analyzer should treat the environment issue as part of the problem context.
- **No new hypotheses possible** (all approaches exhausted): The analyzer should indicate this explicitly. Output `<promise>ALL JOB COMPLETE</promise>` only if verification actually passed — otherwise report exhaustion in the status summary.
