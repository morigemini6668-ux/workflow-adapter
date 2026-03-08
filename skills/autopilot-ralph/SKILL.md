---
name: autopilot-ralph
description: This skill should be used when the user asks to "autopilot ralph", "autopilot-ralph", "자동 루프", "문제 해결 루프", "autopilot loop", "알아서 고쳐줘", "루프 돌면서 해결해줘", "자동으로 해결", "keep fixing until done", or wants an autonomous problem-solving loop that first clarifies the problem and verification method via interactive Q&A, then iterates Analyze-Execute-Verify until resolved.
argument-hint: "<subject> [--max-iterations N] [--copilot] [--worktree|--no-worktree]"
disable-model-invocation: true
---

# Autopilot Ralph

Autonomous problem-solving loop: clarify the problem interactively, then iterate **Analyze → Execute → Verify → Commit** until resolved or max iterations reached.

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
- `--worktree` (optional) — run the entire session in an isolated git worktree
- `--no-worktree` (optional) — explicitly disable worktree isolation

If `--copilot` is present, set `copilot_mode = true` and remove it from the subject name.
If `--worktree` is present, set `worktree_mode = true`. If `--no-worktree` is present, set `worktree_mode = false`.
If neither is specified, set `worktree_mode = null` (will ask the user in Step 2).

If no subject is provided, check `.workflow-adapter/` for exactly one folder containing both a `ralph-state.md` with `type: autopilot` and an `autopilot-target.md`. If found, offer to resume. If zero or multiple found, use AskUserQuestion to ask for the subject name.

## Step 1: Check Existing State

Check whether `.workflow-adapter/{subject}/ralph-state.md` exists.

**If it DOES exist:**
- Read it. If it contains `type: autopilot`, this is a resume or leftover from a previous autopilot session.
- If the frontmatter contains `copilot_mode: true`, set `copilot_mode = true`.
- If the frontmatter contains `worktree_mode: true`, set `worktree_mode = true`.
- If the frontmatter contains `worktree_path`, restore `worktree_path` and `worktree_branch`.
  - Then verify the worktree still exists:
    ```bash
    [ -d "{worktree_path}" ] && echo "EXISTS" || echo "MISSING"
    ```
  - If MISSING: warn the user — "Worktree at `{worktree_path}` no longer exists." — then use AskUserQuestion: "Re-create the worktree and continue, or start fresh?"
    - Re-create: run Step 2.5 again with the same `worktree_branch` name (use `-B` to reset the branch).
    - Fresh: delete `ralph-state.md` and `autopilot-target.md`, proceed to Step 2.
- Use AskUserQuestion: "A previous autopilot-ralph session exists for `{subject}`. Resume or start fresh?"
- If resume: skip to Step 3.
- If fresh: delete `ralph-state.md` and `autopilot-target.md`. If a worktree exists at `worktree_path`, clean it up:
  ```bash
  git worktree remove --force "{worktree_path}"
  git branch -D "{worktree_branch}"
  ```
  Then proceed to Step 2.
- If the state file does NOT contain `type: autopilot`: warn the user and stop.

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

**Question 4 — Worktree isolation (only if `worktree_mode = null`):**
"전체 작업을 별도의 git worktree에서 진행할까요? worktree를 사용하면 메인 브랜치에 영향 없이 작업하고, 각 이터레이션이 커밋으로 기록되어 언제든 히스토리를 확인할 수 있습니다. (Run the entire session in an isolated git worktree? This protects the main branch and records each iteration as a commit.) [y/n]"
- If yes: set `worktree_mode = true`
- If no: set `worktree_mode = false`

After collecting answers, create the session directory and target file:

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

**Get timestamp and session_id:**
```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/ralph-session-info.ts"
```

## Step 2.5: Create Worktree (only if `worktree_mode = true`)

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_PATH="${REPO_ROOT}/../autopilot-{subject}-worktree"
git worktree add "$WORKTREE_PATH" -b "autopilot-{subject}"
echo "WORKTREE_PATH=$WORKTREE_PATH"
```

Store the output path as `worktree_path` and `"autopilot-{subject}"` as `worktree_branch`.

## Step 2.7: Write State File

Compute `session_dir` = absolute path to `.workflow-adapter/{subject}` in the main repo (e.g., `$(git rev-parse --show-toplevel)/.workflow-adapter/{subject}`).

**Write `.workflow-adapter/{subject}/ralph-state.md`** using the Write tool. Include `copilot_mode`, `worktree_mode`, `worktree_path`, `worktree_branch` only when applicable:

```markdown
---
iteration: 0
max_iterations: {N}
completion_promise: "ALL JOB COMPLETE"
subject: {subject}
started_at: "{timestamp}"
type: autopilot
session_id: "{session_id}"
copilot_mode: true           # include only if copilot_mode = true
worktree_mode: true          # include only if worktree_mode = true (--worktree flag or user answered yes in Q4)
worktree_path: "{path}"      # include only if worktree_mode = true
worktree_branch: "{branch}"  # include only if worktree_mode = true
session_dir: "{session_dir}" # always include — absolute path to .workflow-adapter/{subject}
---

You are the Autopilot-Ralph orchestrator for subject '{subject}'. Continue the problem-solving loop.

Read {session_dir}/autopilot-target.md for: problem description, desired outcome, verification method, and the ## Iteration History of all previous attempts.

Execute this iteration (N = current iteration number from frontmatter):
1. ANALYZE: Spawn a foreground analyzer subagent.
   - Read autopilot-target.md's ## Iteration History — do NOT repeat previously failed approaches.
   - Write analysis to {session_dir}/iter-{N}-analysis.md
   - Return only: "Analysis complete: iter-{N}-analysis.md"
2. EXECUTE: Spawn a foreground executor subagent.
   - Read {session_dir}/iter-{N}-analysis.md for the plan.
   - Implement the changes. Be thorough but surgical.
   - Write execution summary to {session_dir}/iter-{N}-execution.md
   - Return only: "Execution complete: {files changed} — {one-line description}"
3. VERIFY: Spawn a foreground verifier subagent.
   - Read {session_dir}/iter-{N}-execution.md for what was changed.
   - Run the verification method from autopilot-target.md exactly.
   - Append results to ## Iteration History in autopilot-target.md directly.
   - Return only: "PASS" or "FAIL: {one-sentence reason}"
4. COMMIT: After verifier returns, commit the worktree (see Step 5.5). Skip if worktree_mode is not set.
5. COMPLETE:
   - If verifier returns PASS: output <promise>ALL JOB COMPLETE</promise>
   - If verifier returns FAIL: output a status summary. Stop hook will re-inject this prompt for the next iteration.
```

## Step 3: Spawn Analyzer

**If `copilot_mode = false` (default):**

```
Task({
  description: "Analyzer: plan the approach for this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are an Analyzer subagent. Your job is read-only — do NOT modify any source files.

## Working Context
{if worktree_mode:
  Working directory: {worktree_path}
  Use relative paths for all code files. Shell commands run from this directory.
}
Session files (read via absolute paths): {session_dir}/

## Instructions

Before starting:
1. Check {session_dir}/../principle.md if it exists — follow it.

Analysis process:
1. Read {session_dir}/autopilot-target.md fully — problem, desired outcome, verification method, and all of ## Iteration History.
2. Examine relevant code and config in the working directory related to the problem area.
3. Consult ## Iteration History — identify which approaches were already tried and failed.
4. Form a concrete, actionable plan. If previous iterations exist, the plan MUST differ from what was already tried.

Write your analysis to {session_dir}/iter-{N}-analysis.md:
## Analysis
- Problem understanding: {concise summary}
- Previous attempts: {what was tried and why it failed, or 'None'}

## Plan
1. {specific action — relative file path:function or :line}
2. {specific action}
3. ...

## Expected Outcome
{what should change after execution}

Then output ONLY: Analysis complete: iter-{N}-analysis.md"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: Spawn a subagent via Task. Do NOT run these steps yourself.**

```
Task({
  description: "Copilot analyzer: plan approach for this iteration",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job: (1) write a prompt file, (2) run copilot-exec.ts, (3) report the result.

1. Write {session_dir}/prompt-analyzer.md:

You are an Analyzer. Your job is read-only — do NOT modify any source files.

{if worktree_mode: Working directory: {worktree_path} — use relative paths for all code files.}
Session files: {session_dir}/

Before starting, read {session_dir}/../principle.md if it exists and follow it.

1. Read {session_dir}/autopilot-target.md fully.
2. Examine relevant code in the working directory.
3. Consult ## Iteration History — do not repeat failed approaches.
4. Form a concrete, actionable plan.

Write analysis to {session_dir}/iter-{N}-analysis.md:
## Analysis
- Problem understanding: ...
- Previous attempts: ...

## Plan
1. {specific action — file:line}
...

## Expected Outcome
...

2. Run: bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '{session_dir}/prompt-analyzer.md' --timeout 600

3. Verify {session_dir}/iter-{N}-analysis.md was created.
Output ONLY: Analysis complete: iter-{N}-analysis.md
</copilot-dispatcher-prompt>"
})
```

Wait for the analyzer to complete before proceeding.

## Step 4: Spawn Executor

**If `copilot_mode = false` (default):**

```
Task({
  description: "Executor: implement the planned changes",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are an Executor subagent. Implement the planned changes precisely.

## Working Context
{if worktree_mode:
  Working directory: {worktree_path}
  Use relative paths for all code files. Shell commands run from this directory.
  This is an isolated git worktree — changes here do not affect the main branch.
}
Session files (read via absolute paths): {session_dir}/

## Instructions

Before starting:
1. Check {session_dir}/../principle.md if it exists — follow it.

Execution process:
1. Read {session_dir}/iter-{N}-analysis.md for the plan.
2. Implement each action precisely. Do not refactor or improve unrelated code.
3. After applying changes, verify they are syntactically correct.

Write execution summary to {session_dir}/iter-{N}-execution.md:
## Changes Applied
- File: {path} — {what was changed and why}

## Plan Item Coverage
- [x] {plan item}
- [ ] {skipped item — reason}

## Notes
{any caveats or observations}

Then output ONLY: Execution complete: {files changed} — {one-line description}"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: Spawn a subagent via Task. Do NOT run these steps yourself.**

```
Task({
  description: "Copilot executor: implement planned changes",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job: (1) write a prompt file, (2) run copilot-exec.ts, (3) report the result.

1. Write {session_dir}/prompt-executor.md:

You are an Executor. Implement the planned changes precisely.

{if worktree_mode:
  Working directory: {worktree_path} — use relative paths for all code files.
  This is an isolated git worktree — changes here do not affect the main branch.
}
Session files: {session_dir}/

Before starting, read {session_dir}/../principle.md if it exists and follow it.

1. Read {session_dir}/iter-{N}-analysis.md for the plan.
2. Implement each action precisely. Do not refactor unrelated code.
3. Verify changes are syntactically correct.

Write execution summary to {session_dir}/iter-{N}-execution.md:
## Changes Applied
- File: {path} — {what changed}

## Plan Item Coverage
- [x] / [ ] {item}

## Notes
...

2. Run: bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '{session_dir}/prompt-executor.md' --timeout 600

3. Verify {session_dir}/iter-{N}-execution.md was created.
Output ONLY: Execution complete: {files changed} — {one-line description}
</copilot-dispatcher-prompt>"
})
```

Wait for the executor to complete before proceeding.

## Step 5: Spawn Verifier

**If `copilot_mode = false` (default):**

```
Task({
  description: "Verifier: confirm whether the changes resolve the problem",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "You are a Verifier subagent. Confirm whether the applied changes resolve the problem.

## Working Context
{if worktree_mode:
  Working directory: {worktree_path}
  Use relative paths for all code files. Run all shell verification commands from this directory.
}
Session files (read/write via absolute paths): {session_dir}/

## Instructions

Before starting:
1. Check {session_dir}/../principle.md if it exists — follow it.

Verification process:
1. Read {session_dir}/autopilot-target.md for the desired outcome and verification method.
2. Read {session_dir}/iter-{N}-execution.md for what was changed.
3. Execute the verification method:
   - Shell command: run it {if worktree_mode: 'from the working directory'}, capture exit code and full stdout/stderr.
   - Behavioral description: test the described behavior using available tools.
4. Compare result against the desired outcome.
5. Append to ## Iteration History in {session_dir}/autopilot-target.md:

### Iteration {N} — {PASS|FAIL}
- **Approach**: {summary from analysis}
- **Changes**: {summary from execution}
- **Verification**: {method used} → {PASS|FAIL}
- **Evidence**: {key output line or observation}

Then output ONLY: PASS
or: FAIL: {one-sentence reason}"
})
```

**If `copilot_mode = true`:**

**IMPORTANT: Spawn a subagent via Task. Do NOT run these steps yourself.**

```
Task({
  description: "Copilot verifier: confirm changes resolve problem",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<copilot-dispatcher-prompt>
You are a Copilot dispatcher subagent. Your ONLY job: (1) write a prompt file, (2) run copilot-exec.ts, (3) report the result.

1. Write {session_dir}/prompt-verifier.md:

You are a Verifier. Confirm whether the applied changes resolve the problem.

{if worktree_mode:
  Working directory: {worktree_path} — run all shell commands from here.
}
Session files: {session_dir}/

Before starting, read {session_dir}/../principle.md if it exists and follow it.

1. Read {session_dir}/autopilot-target.md for desired outcome and verification method.
2. Read {session_dir}/iter-{N}-execution.md for what was changed.
3. Execute the verification method and capture the result.
4. Append to ## Iteration History in {session_dir}/autopilot-target.md:

### Iteration {N} — {PASS|FAIL}
- **Approach**: ...
- **Changes**: ...
- **Verification**: {method} → {PASS|FAIL}
- **Evidence**: {key output}

2. Run: bun '${CLAUDE_PLUGIN_ROOT}/scripts/copilot-exec.ts' --prompt-file '{session_dir}/prompt-verifier.md' --timeout 600

3. Read the updated ## Iteration History to check the result.
Output ONLY: PASS or FAIL: {one-sentence reason}
</copilot-dispatcher-prompt>"
})
```

Wait for the verifier to complete.

## Step 5.5: Commit Iteration (only if `worktree_mode = true`)

After the verifier returns, commit the worktree state:

```bash
cd "{worktree_path}"
git add -A
git commit --allow-empty -m "autopilot({subject}) iter-{N}: {PASS|FAIL} — {one-line summary}"
```

`--allow-empty` ensures the commit is always created, even if the executor failed to produce changes. Each commit maps to one iteration, making `git log`, `git diff`, and `git checkout` useful for reviewing progress.

## Step 6: Completion Check

**If the verifier returned `PASS`:**

If `worktree_mode = true`, remove the worktree (branch is preserved intentionally — no `--force` needed since all changes are committed):
```bash
git worktree remove "{worktree_path}"
```

Output exactly:
```
<promise>ALL JOB COMPLETE</promise>
```

Then inform the user (substitute `worktree_branch` from the in-memory value before the state file is deleted by the Stop hook):
```
Autopilot complete after {N} iteration(s).

Changes are on branch: {worktree_branch}
  → Review:  git log {worktree_branch}
  → Merge:   git merge {worktree_branch}
  → Discard: git branch -D {worktree_branch}
```

**If the verifier returned `FAIL`:**

Output a status summary:
```
Autopilot iteration {N}/{max_iterations} complete. Problem not yet resolved.
Approach tried: {summary}
Changes: {what was changed}
Verification failure: {reason from verifier}
{if worktree_mode: Branch so far: {worktree_branch} — use `git log {worktree_branch}` to review attempts.}
Next iteration will attempt a different approach based on Iteration History.
```

The Stop hook will re-inject the prompt in `ralph-state.md` to continue the loop.

**Edge Cases:**
- **Max iterations reached**: Stop hook handles termination. Output the FAIL summary above, including the branch hint if `worktree_mode = true`.
- **Verifier cannot run the command**: Verifier outputs `FAIL` with the error. Next iteration's analyzer should treat the environment issue as context.
- **All approaches exhausted**: Analyzer should indicate this explicitly in the analysis.

## Cancellation

Cancel with `/workflow-adapter:ralph-cancel {subject}` to remove the state file and stop the loop.
The cancel skill reads `worktree_path` and `worktree_branch` from the state file and cleans up the worktree automatically.
