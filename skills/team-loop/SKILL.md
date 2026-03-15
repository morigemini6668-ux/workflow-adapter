---
name: team-loop
description: This skill should be used when the user asks to "team loop", "팀 루프", "phased loop", "단계별 루프", "team autopilot", "팀 오토파일럿", "deep autopilot", "심층 루프", "research and fix", "조사하고 고쳐줘", or wants a phased development loop that spawns historian, researcher, planner, executer, and reviewer teammates to iteratively research, plan, execute, and verify until the problem is solved. Use this skill whenever the user has a complex problem that needs research before implementation, a task that has failed multiple times and needs a fresh approach with different strategies, wants specialized teammates to collaborate on a difficult problem, or any multi-step development work where understanding context first leads to better results — even if the user doesn't explicitly mention "team loop".
argument-hint: "<subject> [--max-iterations N] [--quick|--deep] [--worktree|--no-worktree]"
disable-model-invocation: true
---

# Team Loop

Phased development loop: clarify the problem interactively (P0), then iterate **Research (P1) -> Plan (P2) -> Execute (P3) -> Verify (P4)** using teammates until resolved or max iterations reached.

Unlike `autopilot-ralph` (single-agent analyze-execute-verify), this skill spawns a **team of specialists** — historian, researcher, planner, executer, reviewer — coordinated by you (the orchestrator). Research runs on the first iteration and when stuck; planning explicitly avoids repeating failed approaches.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 0: Parse Arguments

Extract from the skill arguments:
- `subject` (required) — a short name for this session (e.g., `auth-refactor`, `ci-fix`)
- `--max-iterations N` (optional) — maximum loop iterations; default is `10`
- `--quick` (optional) — use quick P0 mode (3 questions, autopilot-ralph style)
- `--deep` (optional) — use deep P0 mode (5+ category-specific questions)
- `--worktree` (optional) — run the entire session in an isolated git worktree
- `--no-worktree` (optional) — explicitly disable worktree isolation

If `--quick` is present, set `p0_mode = "quick"` and remove it from the subject name.
If `--deep` is present, set `p0_mode = "deep"` and remove it from the subject name.
If neither is specified, set `p0_mode = "default"`.
If `--worktree` is present, set `worktree_mode = true`. If `--no-worktree` is present, set `worktree_mode = false`.
If neither is specified, set `worktree_mode = null` (will ask the user in Step 2).

If no subject is provided, check `.workflow-adapter/` for exactly one folder containing a `ralph-state.md` with `type: phased-loop`. If found, offer to resume. If zero or multiple found, use AskUserQuestion to ask for the subject name.

## Step 1: Check Existing State

Check whether `.workflow-adapter/{subject}/ralph-state.md` exists.

**If it DOES exist:**
- Read it. If it contains `type: phased-loop`, this is a resume or leftover from a previous team-loop session.
- Restore state from frontmatter: `p0_mode`, `worktree_mode`, `worktree_path`, `worktree_branch`, `team_name`, `phase`.
- If the frontmatter contains `worktree_path`, verify the worktree still exists:
  ```bash
  [ -d "{worktree_path}" ] && echo "EXISTS" || echo "MISSING"
  ```
  - If MISSING: warn the user — "Worktree at `{worktree_path}` no longer exists." — then use AskUserQuestion: "Re-create the worktree and continue, or start fresh?"
    - Re-create: run Step 3 again with the same `worktree_branch` name (use `-B` to reset the branch).
    - Fresh: delete `ralph-state.md` and `team-loop-target.md`, proceed to Step 2.
- If the frontmatter contains `team_name`, attempt to recover the team:
  - Try sending a broadcast to check if teammates are still alive. If no response, the team will need to be re-created in Step 5.
- Use AskUserQuestion: "A previous team-loop session exists for `{subject}` (phase: {phase}, iteration: {iteration}/{max_iterations}). Resume or start fresh?"
- If resume: skip to Step 5 (Create Team + Spawn Teammates), using the restored state.
- If fresh: delete `ralph-state.md` and `team-loop-target.md`. If a worktree exists at `worktree_path`, clean it up:
  ```bash
  git worktree remove --force "{worktree_path}"
  git branch -D "{worktree_branch}"
  ```
  Then proceed to Step 2.
- If the state file does NOT contain `type: phased-loop`: warn the user — "State file exists but is not a team-loop session (type: {type}). Cannot resume." — and stop.

**If it does NOT exist:** proceed to Step 2.

## Step 2: P0 — Problem Elicitation

**Pre-flight: Check for uncommitted changes (fresh start only — skip if resuming from Step 1)**

Run:
```bash
git status --porcelain
```

If the output is **non-empty**, use AskUserQuestion to ask:

"커밋되지 않은 변경 파일이 있습니다: (There are uncommitted changes in the working tree:)
{git status --short output}

어떻게 할까요? (How would you like to proceed?)
1. **commit** — 지금 커밋하고 계속 진행 (commit now and continue)
2. **stash** — 변경사항을 임시 저장하고 계속 진행 (stash changes and continue)
3. **continue** — 그대로 계속 진행 (proceed with dirty working tree)
4. **abort** — 취소하고 직접 처리 (abort so you can handle it manually)"

- If **commit**: use AskUserQuestion to ask for a commit message, then run `git add -A && git commit -m "{message}"`, then continue.
- If **stash**: run `git stash push -m "team-loop({subject}) pre-session stash"` then continue.
- If **continue**: proceed as-is.
- If **abort**: stop here and inform the user to handle it manually before retrying.

If the output is empty, proceed immediately.

---

### P0 Quick Mode (`p0_mode = "quick"`)

Use AskUserQuestion to collect the following, one question at a time:

**Question 1 — Problem description:**
"해결하고 싶은 문제가 무엇인가요? 구체적으로 설명해주세요. (What problem do you want to solve? Describe it concretely.)"

**Question 2 — Desired outcome:**
"완료되었을 때 어떤 상태여야 하나요? (What should the result look like when done?)"

**Question 3 — Verification method:**
"결과를 어떻게 검증하나요? 실행 가능한 커맨드나 확인 방법을 알려주세요. (How do we verify success? Provide a shell command or describe the check.)"
- Examples: `bun test`, `npm run build`, `curl -f localhost:3000/health`, or a description like "All TypeScript errors resolved and build passes"

---

### P0 Default Mode (`p0_mode = "default"`)

Use AskUserQuestion to collect the following, one question at a time:

**Question 1 — Problem description:**
"해결하고 싶은 문제가 무엇인가요? 구체적으로 설명해주세요. (What problem do you want to solve? Describe it concretely.)"

**JTBD Detection:** After reading the user's answer to Question 1, check if the user provided a **solution** rather than a **problem** (e.g., "add caching", "switch to PostgreSQL", "refactor the auth module"). If the answer describes an action to take rather than an outcome to achieve, ask a follow-up:

"그건 해결 방법인 것 같은데, 달성하고 싶은 결과가 무엇인가요? (That sounds like a solution. What outcome are you trying to achieve?)"
- If the user confirms they want that specific solution, accept it and continue.
- If the user reveals a deeper problem, use that as the problem description instead.

**Question 2 — Desired outcome:**
"완료되었을 때 어떤 상태여야 하나요? (What should the result look like when done?)"

**Question 3 — Verification method:**
"결과를 어떻게 검증하나요? 실행 가능한 커맨드나 확인 방법을 알려주세요. (How do we verify success? Provide a shell command or describe the check.)"

**Validation Gate — "Can I write a test?":** After collecting the verification method, assess whether you can formulate a concrete verification command or test from the user's answers. If the verification method is too vague (e.g., "it should work better", "code should be clean"), ask:

"검증 방법이 좀 더 구체적이면 좋겠는데, 테스트를 작성할 수 있을까요? 예를 들어 어떤 커맨드를 실행하면 성공/실패를 판단할 수 있나요? (Can we make the verification more concrete? For example, what command would tell us if it succeeded or failed?)"

If the user provides a concrete method, use it. If they cannot, accept the descriptive verification but note it as a risk.

**Question 4 — Summary and Confirm:**
Present a summary of the problem, outcome, and verification method, then ask:
"이 내용이 맞나요? 수정할 부분이 있으면 말씀해주세요. (Does this look correct? Let me know if anything needs to be changed.) [y/n]"
- If yes: proceed.
- If no: ask which part to revise, then update and re-confirm.

---

### P0 Deep Mode (`p0_mode = "deep"`)

**Category Detection:** First, ask the user for their problem description, then classify into **bug**, **feature**, or **refactor**. Read `${CLAUDE_PLUGIN_ROOT}/skills/team-loop/references/p0-deep-questions.md` for the category-specific follow-up questions.

**JTBD Detection:** Same as default mode — if the user provides a solution, ask for the underlying outcome.

**Validation Gate:** Same as default mode — "Can I write a test?"

**Summary and Confirm:** Same as default mode — present summary and confirm.

---

### After P0 (all modes)

**Question — Worktree isolation (only if `worktree_mode = null`):**
"전체 작업을 별도의 git worktree에서 진행할까요? worktree를 사용하면 메인 브랜치에 영향 없이 작업하고, 각 이터레이션이 커밋으로 기록됩니다. (Run the entire session in an isolated git worktree? This protects the main branch and records each iteration as a commit.) [y/n]"
- If yes: set `worktree_mode = true`
- If no: set `worktree_mode = false`

Create the session directory and target file:

```bash
mkdir -p ".workflow-adapter/{subject}"
```

**Write `.workflow-adapter/{subject}/team-loop-target.md`:**
```markdown
# Team Loop Target: {subject}

## Problem Description
{user's problem description}

## Desired Outcome
{user's desired outcome}

## Verification Method
{user's verification method}

## Constraints
{any constraints mentioned during P0, or "None"}

## Iteration History
(empty — first iteration)
```

**Get timestamp and session_id:**
```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/ralph-session-info.ts"
```

## Step 3: Create Worktree (only if `worktree_mode = true`)

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_PATH="${REPO_ROOT}/../phased-{subject}-worktree"
git worktree add "$WORKTREE_PATH" -b "phased-{subject}"
echo "WORKTREE_PATH=$WORKTREE_PATH"
```

Store the output path as `worktree_path` and `"phased-{subject}"` as `worktree_branch`.

## Step 4: Write State File

Compute `session_dir` = absolute path to `.workflow-adapter/{subject}` in the main repo (e.g., `$(git rev-parse --show-toplevel)/.workflow-adapter/{subject}`).

Set `team_name` = `"wa-team-loop-{subject}"`.

**Write `.workflow-adapter/{subject}/ralph-state.md`** using the Write tool. Include `worktree_path`, `worktree_branch` only when `worktree_mode = true`:

```markdown
---
iteration: 0
max_iterations: {N}
completion_promise: "ALL JOB COMPLETE"
session_id: "{session_id}"
type: phased-loop
phase: p1
p0_mode: {p0_mode}
subject: {subject}
started_at: "{timestamp}"
worktree_mode: {true|false}
worktree_path: "{path}"         # include only if worktree_mode = true
worktree_branch: "{branch}"     # include only if worktree_mode = true
session_dir: "{session_dir}"
team_name: "wa-team-loop-{subject}"
---

You are the Team-Loop orchestrator for subject '{subject}'. Continue the phased development loop.

Read {session_dir}/team-loop-target.md for: problem description, desired outcome, verification method, constraints, and the ## Iteration History of all previous attempts.

Current iteration: N (from frontmatter). Current phase: (from frontmatter).

Execute the phased loop for this iteration:

0. ITERATION TASKS: Create per-iteration progress tasks:
   - Create all 4 phase tasks with TaskCreate (subject + description only).
   - Then set dependencies with TaskUpdate({ taskId: "{id}", addBlockedBy: ["{dep_id}"] }):
     P2 blocked by P1, P3 blocked by P2, P4 blocked by P3.
   If resuming mid-iteration, only create tasks for remaining phases. Teammates claim and update these via TaskUpdate.

1. CHECK PHASE: Read the `phase` field from frontmatter.
   - If `p1`: go to Step 6 (Research Phase)
   - If `p2`: go to Step 7 (Planning Phase)
   - If `p3`: go to Step 8 (Execution Phase)
   - If `p4`: go to Step 9 (Verification Phase)

2. TEAM SETUP: If no team exists yet, go to Step 5 (Create Team + Spawn Teammates).

3. After completing the current phase:
   - Mark the current phase's task as completed via TaskUpdate
   - Update the `phase` field in ralph-state.md frontmatter
   - Output a status summary
   - The Stop hook will re-inject this prompt for the next phase/iteration

4. COMPLETION:
   - If verification PASSES: output <promise>ALL JOB COMPLETE</promise>
   - If verification FAILS and iterations remain: update iteration history, output status summary
   - If max iterations reached: output final summary with <promise>ALL JOB COMPLETE</promise>
```

After writing the state file, create the iteration tasks and proceed to Step 5 (Create Team).

**Create iteration tasks for iteration 1:**
```
// Step 1: Create all tasks
TaskCreate({ subject: "iter-1-P1: Research", description: "Historian + researcher gather context" })
TaskCreate({ subject: "iter-1-P2: Plan", description: "Planner creates iter-1-plan.md" })
TaskCreate({ subject: "iter-1-P3: Execute", description: "Executer implements the plan" })
TaskCreate({ subject: "iter-1-P4: Verify", description: "Reviewer validates + verification command" })

// Step 2: Set dependencies (use the task IDs returned from TaskCreate above)
TaskUpdate({ taskId: "{P2-id}", addBlockedBy: ["{P1-id}"] })
TaskUpdate({ taskId: "{P3-id}", addBlockedBy: ["{P2-id}"] })
TaskUpdate({ taskId: "{P4-id}", addBlockedBy: ["{P3-id}"] })
```

## Step 5: Create Team + Spawn Teammates

Create the team:
```
TeamCreate({ team_name: "wa-team-loop-{subject}", description: "Team loop for {subject}" })
```

Read the agent definition files to get each teammate's system prompt:
- `${CLAUDE_PLUGIN_ROOT}/agents/historian.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/researcher.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/planner.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/executer.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`

### Spawn Teammates

Read `${CLAUDE_PLUGIN_ROOT}/skills/team-loop/references/spawn-templates.md` for each teammate's spawn prompt template. Substitute `{subject}`, `{session_dir}`, `{worktree_path}`, `{N}`, and other placeholders with actual values.

**Always spawn:** Reviewer (persistent across iterations).

**Conditionally spawn (iteration == 1 OR stuck_flag == true):** Historian + Researcher.
On normal subsequent iterations (iteration > 1 AND not stuck), skip historian/researcher and go directly to Step 7 (Planning Phase).

Spawn each role using the template from the reference file. Set `run_in_background: true` for all teammates.

## Step 6: P1 — Research Phase (conditional: first iteration OR stuck)

**Skip condition:** If `iteration > 1` AND `stuck_flag` is NOT set, skip this step entirely and go to Step 7 (Planning Phase).

**If this is the first iteration OR stuck_flag is set:**

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P1", status: "in_progress" })`

1. Historian and researcher were spawned in Step 5. Wait for both to send their findings via SendMessage.

2. **Relay and synthesize**: As findings arrive from historian and researcher:
   - If the researcher requests user input (e.g., needs clarification on the problem domain), use AskUserQuestion to get the answer, then relay it back:
     ```
     SendMessage({ type: "message", recipient: "researcher", content: "User says: {answer}", summary: "Relaying user input" })
     ```
   - If findings from one teammate are relevant to the other, relay them:
     ```
     SendMessage({ type: "message", recipient: "researcher", content: "[Orchestrator] Historian found: {summary}. Does this affect your research?", summary: "Sharing historian context" })
     ```

3. **Synthesize research**: Once both historian and researcher have reported, create a brief research synthesis:
   - Read `{session_dir}/doc/historian-context.md`
   - Read all researcher documents in `{session_dir}/doc/`
   - Combine into key findings relevant to the current problem

4. **Update progress**:
   - `TaskUpdate({ taskId: "iter-{N}-P1", status: "completed" })`
   - Update `phase` in ralph-state.md frontmatter to `p2`.

5. Proceed to Step 7 (Planning Phase).

## Step 7: P2 — Planning Phase

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P2", status: "in_progress" })`

Spawn the planner using the **Planner** template from `references/spawn-templates.md`. Substitute placeholders including the CONSTRAINT section with the actual iteration history.

Wait for the planner to report completion via SendMessage.

After the planner finishes:
1. Read `{session_dir}/iter-{N}-plan.md` to verify it was written and contains a valid plan.
2. If the plan is missing or empty, ask the planner to retry.
3. **Update progress**:
   - `TaskUpdate({ taskId: "iter-{N}-P2", status: "completed" })`
   - Update `phase` in ralph-state.md frontmatter to `p3`.
4. Proceed to Step 8 (Execution Phase).

## Step 8: P3 — Execution Phase

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P3", status: "in_progress" })`

Spawn the primary executer using the **Executer** template from `references/spawn-templates.md`.

**For parallel execution** (if the plan has independent tasks that can run concurrently): spawn additional executers using `executer-{n}` naming (e.g., `executer-2`, `executer-3`) with the same template but different assigned plan items.

Wait for all executers to report completion via SendMessage.

**Resolve conflicts**: If executers report resource conflicts (same file, conflicting changes):
```
SendMessage({ type: "message", recipient: "executer-1", content: "Wait for executer-2 to finish with file X", summary: "Resolving file conflict" })
```

After all executers complete:

1. **Commit iteration** (only if `worktree_mode = true`):
   ```bash
   cd "{worktree_path}"
   git add -A
   git commit --allow-empty -m "phased({subject}) iter-{N}: {one-line summary of changes}"
   ```

2. **Update progress**:
   - `TaskUpdate({ taskId: "iter-{N}-P3", status: "completed" })`
   - Update `phase` in ralph-state.md frontmatter to `p4`.
3. Proceed to Step 9 (Verification Phase).

## Step 9: P4 — Verification + Loop Decision

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P4", status: "in_progress" })`

### Verification

Send the implementation to the reviewer for validation:
```
SendMessage({
  type: "message",
  recipient: "reviewer",
  content: "[Orchestrator] Iteration {N} execution is complete. Please review:\n\n1. Read {session_dir}/iter-{N}-plan.md for what was planned\n2. Read {session_dir}/iter-{N}-execution.md for what was implemented\n3. {if worktree_mode: Examine the changes in {worktree_path}}\n4. Read {session_dir}/team-loop-target.md for the acceptance criteria\n\nValidate:\n- Does the implementation match the plan?\n- Are there obvious bugs, security issues, or edge cases?\n- Does the code follow project conventions?\n\nReturn: PASS or FAIL: {specific reasons}",
  summary: "Requesting iteration review"
})
```

Wait for the reviewer's response.

Then run the verification method from team-loop-target.md:
```bash
{if worktree_mode: cd "{worktree_path}" &&} {verification_command}
```

### Loop Decision

Evaluate both the reviewer's verdict and the verification result. There are **4 possible branches**:

**Branch 1 — PASS (both reviewer approves AND verification succeeds):**
- `TaskUpdate({ taskId: "iter-{N}-P4", status: "completed" })`
- Proceed to Step 10 (Completion — Success).

**Branch 2 — FAIL + not stuck:**
- Append to `## Iteration History` in `{session_dir}/team-loop-target.md`:
  ```markdown
  ### Iteration {N} — FAIL
  - **Approach**: {summary from iter-{N}-plan.md}
  - **Changes**: {summary from iter-{N}-execution.md}
  - **Reviewer**: {reviewer's verdict}
  - **Verification**: {verification command} -> {PASS|FAIL}
  - **Evidence**: {key output line or error message}
  ```
- `TaskUpdate({ taskId: "iter-{N}-P4", status: "completed" })`
- Update `phase` in ralph-state.md to `p2` (loop back to Planning, skip Research).
- Output status summary:
  ```
  Team-loop iteration {N}/{max_iterations} complete. Problem not yet resolved.
  Approach tried: {summary}
  Verification failure: {reason}
  {if worktree_mode: Branch so far: {worktree_branch} — use `git log {worktree_branch}` to review attempts.}
  Next iteration will try a different approach.
  ```
- The Stop hook will re-inject the prompt to continue the loop.

**Branch 3 — FAIL + stuck (same error 2x or same approach 2x):**

**Stuck Detection:** Read `## Iteration History` in team-loop-target.md. If the last 2 iterations had the **same error** (substantially identical verification failure output) or **substantially the same approach** (the plan descriptions are very similar), set `stuck_flag = true`.

- Append to `## Iteration History` (same format as Branch 2, but add `- **Stuck**: true — repeating pattern detected`).
- `TaskUpdate({ taskId: "iter-{N}-P4", status: "completed" })`
- Update `phase` in ralph-state.md to `p1` (loop back to Research for fresh context).
- Output status summary:
  ```
  Team-loop iteration {N}/{max_iterations} — STUCK DETECTED.
  The last 2 iterations used similar approaches or hit the same error.
  Looping back to Research Phase (P1) for fresh context and alternative approaches.
  {if worktree_mode: Branch so far: {worktree_branch}}
  ```
- The Stop hook will re-inject the prompt. The next iteration will start at P1 (Research) instead of P2 (Planning).

**Branch 4 — Max iterations reached:**
- Proceed to Step 10 (Completion — Failure).

## Step 10: Completion

### Success (Branch 1 — verification passed)

1. **Append final entry to Iteration History** in `{session_dir}/team-loop-target.md`:
   ```markdown
   ### Iteration {N} — PASS
   - **Approach**: {summary from iter-{N}-plan.md}
   - **Changes**: {summary from iter-{N}-execution.md}
   - **Reviewer**: PASS
   - **Verification**: {verification command} -> PASS
   ```

2. **Shutdown all teammates**:
   ```
   SendMessage({ type: "shutdown_request", recipient: "historian", content: "Loop complete — success" })
   SendMessage({ type: "shutdown_request", recipient: "researcher", content: "Loop complete — success" })
   SendMessage({ type: "shutdown_request", recipient: "planner", content: "Loop complete — success" })
   SendMessage({ type: "shutdown_request", recipient: "executer-1", content: "Loop complete — success" })
   SendMessage({ type: "shutdown_request", recipient: "reviewer", content: "Loop complete — success" })
   ```
   (Only send to teammates that were actually spawned. Skip historian/researcher if they were not spawned in this iteration.)

3. **Delete team**:
   ```
   TeamDelete()
   ```

4. **Remove worktree** (only if `worktree_mode = true`):
   ```bash
   git worktree remove "{worktree_path}"
   ```
   The branch is preserved intentionally — no `--force` needed since all changes are committed.

5. **Output completion promise** (store `worktree_branch` in a local variable before the state file is deleted by the Stop hook):
   ```
   <promise>ALL JOB COMPLETE</promise>
   ```

6. **Report to user**:
   ```
   Team-loop complete after {N} iteration(s).

   Changes are on branch: {worktree_branch}
     -> Review:  git log {worktree_branch}
     -> Merge:   git merge {worktree_branch}
     -> Discard: git branch -D {worktree_branch}
   ```
   (If `worktree_mode = false`, omit the branch information and instead note: "Changes were applied directly to the current branch.")

### Failure (Branch 4 — max iterations reached)

1. **Append final entry to Iteration History** in `{session_dir}/team-loop-target.md`:
   ```markdown
   ### Iteration {N} — FAIL (max iterations reached)
   - **Approach**: {summary from iter-{N}-plan.md}
   - **Changes**: {summary from iter-{N}-execution.md}
   - **Reviewer**: {reviewer's verdict}
   - **Verification**: {verification command} -> {result}
   ```

2. **Shutdown all teammates** (same pattern as success).

3. **Delete team**:
   ```
   TeamDelete()
   ```

4. **Output summary of all attempts**:
   ```
   Team-loop FAILED after {max_iterations} iterations. Problem not resolved.

   Iteration summary:
   {for each iteration in ## Iteration History:}
     Iteration {M}: {approach} -> {PASS|FAIL} — {one-line reason}

   {if worktree_mode:
   All attempts are preserved on branch: {worktree_branch}
     -> Review:  git log {worktree_branch}
     -> Discard: git branch -D {worktree_branch}
   }

   Session files preserved at: {session_dir}/
   ```

5. **Output completion promise** (to stop the loop cleanly):
   ```
   <promise>ALL JOB COMPLETE</promise>
   ```

## Step 11: Edge Cases

### Resume from Previous Session

When a state file exists (detected in Step 1):
- **Worktree exists**: Restore `worktree_path` from frontmatter, verify it still exists on disk, resume from the saved `phase`.
- **Worktree missing**: Offer to re-create (Step 3 with `-B` flag) or start fresh.
- **Team recovery**: After resume, re-create the team (Step 5) since teams do not persist across sessions. All teammates must be re-spawned. The iteration history and session files provide continuity.

### Teammate Failure

If a teammate becomes unresponsive or fails mid-task:
1. Check if the teammate saved a checkpoint to `{session_dir}/checkpoint-{teammate-name}.md`.
2. Read the checkpoint to understand what was completed.
3. Re-spawn the failed teammate with the same name, including checkpoint context in the prompt:
   ```
   Task({
     description: "Executer-1 (re-spawned): continue from checkpoint",
     subagent_type: "general-purpose",
     team_name: "wa-team-loop-{subject}",
     name: "executer-1",
     run_in_background: true,
     prompt: "<system prompt from executer.md>\n\n... (same as original prompt)\n\n## CHECKPOINT RECOVERY\nYou are being re-spawned after a failure. Read your checkpoint file first:\n{checkpoint content}\n\nContinue from where you left off. Do not redo completed work."
   })
   ```
4. If no checkpoint exists, re-spawn with the full original task description.

### Context Exhaustion

If an executer or other teammate stops due to context window exhaustion:
1. The teammate should have saved a checkpoint before running out of context (same pattern as `execute/SKILL.md`).
2. Follow the **Teammate Failure** recovery process above.
3. If the orchestrator itself is running low on context, output a status summary and let the Stop hook re-inject the prompt for a fresh context window. The state file and session files preserve all necessary state.

### Cancellation

Cancel an active team-loop session with:
```
/workflow-adapter:team-loop-cancel {subject}
```

The cancel skill reads `ralph-state.md`, verifies `type: phased-loop`, cleans up the worktree, deletes the state file, and attempts TeamDelete for any active team.
