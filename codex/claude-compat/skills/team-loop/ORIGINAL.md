---
name: team-loop
description: This skill should be used when the user asks to "team loop", "팀 루프", "phased loop", "단계별 루프", "team autopilot", "팀 오토파일럿", "deep autopilot", "심층 루프", "research and fix", "조사하고 고쳐줘", or wants a phased development loop that spawns historian, researcher, planner, executer, and reviewer teammates to iteratively research, plan, execute, and verify until the problem is solved. Use this skill whenever the user has a complex problem that needs research before implementation, a task that has failed multiple times and needs a fresh approach with different strategies, wants specialized teammates to collaborate on a difficult problem, or any multi-step development work where understanding context first leads to better results — even if the user doesn't explicitly mention "team loop".
argument-hint: "<subject> [--max-iterations N] [--quick|--deep] [--worktree|--no-worktree]"
disable-model-invocation: true
---

# Team Loop

Phased development loop: clarify the problem interactively (P0), then iterate **Research (P1) -> Plan + Review (P2) -> Execute (P3) -> Verify (P4)** using teammates until resolved or max iterations reached.

Unlike `autopilot-ralph` (single-agent analyze-execute-verify), this skill spawns a **team of specialists** — historian, researcher, planner, executer(s), reviewer — coordinated by you (the orchestrator). Teammates actively collaborate across phases: historian ↔ researcher share findings in P1, the reviewer gates the plan in P2, the planner assigns work to one or more executers, and executers can request research support in P3.

**Worktree Safety — MANDATORY:**
- Use `EnterWorktree`/`ExitWorktree` tools for all worktree operations. **NEVER use raw `git worktree add/remove` commands.**
- `ExitWorktree({ action: "remove" })` will automatically refuse if there are uncommitted changes — this is the safety net.
- **NEVER call `ExitWorktree({ action: "remove" })` automatically.** Only the user may decide to remove a worktree. After completion, call `ExitWorktree({ action: "keep" })` and report the branch name so the user can clean up later.
- **NEVER pass `discard_changes: true`** unless the user explicitly asks to discard.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

**Backlog Check:**
Check if `.workflow-adapter/backlog/` exists and contains `.md` files with `status: pending` in their frontmatter. If pending items exist, briefly list them to the user and ask:
```
AskUserQuestion({
  questions: [{
    question: "There are pending backlog items:\n\n{list of pending items with type and priority}\n\nWould you like to address any of these in this team-loop session?",
    header: "Backlog",
    options: [
      { label: "Yes", description: "I'll incorporate some backlog items into this session" },
      { label: "No", description: "Proceed without addressing backlog items" }
    ],
    multiSelect: false
  }]
})
```
If yes, ask which items to include and factor them into the problem scope. If no or if the backlog directory is empty/missing, proceed normally.

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
- Restore state from frontmatter: `p0_mode`, `worktree_mode`, `worktree_path`, `worktree_branch`, `team_name`, `phase`, `status`.
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
- If fresh: delete `ralph-state.md` and `team-loop-target.md`. If the session is in a worktree, commit any changes first (`git add -A && git commit -m "{subject}: save work before reset"`), then ask the user:
  ```
  AskUserQuestion({ questions: [{ question: "Remove existing worktree? (changes have been committed to branch {worktree_branch})", options: [{ label: "Yes" }, { label: "No, keep it" }] }] })
  ```
  - If Yes: `ExitWorktree({ action: "remove" })` — the tool will refuse if uncommitted changes remain.
  - If No: `ExitWorktree({ action: "keep" })`
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

```
REPO_ROOT=$(git rev-parse --show-toplevel)   # save before entering worktree
EnterWorktree({ name: "phased-{subject}" })
```

The tool creates a worktree under `.claude/worktrees/phased-{subject}` and switches the session directory into it automatically. Store the current working directory as `worktree_path` and `"phased-{subject}"` as `worktree_branch`. Store `REPO_ROOT` for accessing `.workflow-adapter/` files.

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
status: active
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
   - Set `status: active` in ralph-state.md frontmatter (so the Stop hook re-injects the prompt)
   - Output a status summary
   - The Stop hook will re-inject this prompt for the next phase/iteration

   **IMPORTANT — Waiting for teammates:**
   When you have spawned teammates and are waiting for their responses (via SendMessage), you MUST set `status: waiting` in ralph-state.md frontmatter BEFORE your turn ends. This prevents the Stop hook from creating a busy-wait loop. You will be re-activated naturally when a teammate sends you a message.
   When a teammate message arrives and you are ready to proceed, set `status: active` in ralph-state.md frontmatter.

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

### Cleanup Previous Iteration (iteration > 1 only)

If this is NOT the first iteration, shut down all teammates from the previous iteration before spawning new ones:
```
// Shutdown all previous teammates
SendMessage({ to: "historian", message: "Iteration complete — shutting down for next iteration", summary: "Shutdown" })
SendMessage({ to: "researcher", message: "Iteration complete — shutting down for next iteration", summary: "Shutdown" })
SendMessage({ to: "planner", message: "Iteration complete — shutting down for next iteration", summary: "Shutdown" })
SendMessage({ to: "reviewer", message: "Iteration complete — shutting down for next iteration", summary: "Shutdown" })
// Also shutdown any executers from P3 (executer-1, executer-2, etc.)
```
Wait briefly for shutdowns to complete. If the team was already deleted, re-create it.

### Create Team (first iteration only)

```
TeamCreate({ team_name: "wa-team-loop-{subject}", description: "Team loop for {subject}" })
```

### Spawn Teammates

Read the agent definition files to get each teammate's system prompt:
- `${CLAUDE_PLUGIN_ROOT}/agents/historian.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/researcher.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/planner.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/executer.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`

Read `${CLAUDE_PLUGIN_ROOT}/skills/team-loop/references/spawn-templates.md` for each teammate's spawn prompt template. Substitute `{subject}`, `{session_dir}`, `{worktree_path}`, `{N}`, and other placeholders with actual values.

**Spawn at iteration start:** Historian, Researcher, Planner, Reviewer (4 teammates). These persist across all phases within the iteration.

**Executers are NOT spawned here** — they are spawned in Step 8 (P3) based on the planner's execution plan.

Spawn each role using the template from the reference file. Set `run_in_background: true` for all teammates.

## Step 6: P1 — Research Phase

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P1", status: "in_progress" })`

1. Historian and researcher were spawned in Step 5. They work in parallel and **actively communicate with each other**:
   - Historian sends findings to researcher: `SendMessage({ to: "researcher", message: "Found relevant context: {summary}", summary: "Sharing git/project context" })`
   - Researcher can ask historian for clarification: `SendMessage({ to: "historian", message: "Can you check git history for {topic}?", summary: "Requesting additional context" })`
   - Both report final findings to orchestrator when done.

2. **Orchestrator role**: Monitor and relay as needed:
   - If a teammate requests user input, use AskUserQuestion and relay the answer back.
   - If a teammate's findings are stuck or blocked, nudge the other to help.

3. **Wait for results**: After spawning teammates, set `status: waiting` in ralph-state.md frontmatter. You will be re-activated when teammates send messages. When both report their findings, set `status: active`.

4. **Synthesize research**: Once both historian and researcher have reported, create a brief research synthesis:
   - Read `{session_dir}/doc/historian-context.md`
   - Read all researcher documents in `{session_dir}/doc/`
   - Combine into key findings relevant to the current problem

5. **Update progress**:
   - `TaskUpdate({ taskId: "iter-{N}-P1", status: "completed" })`
   - Update `phase` in ralph-state.md frontmatter to `p2`.
   - Set `status: active` in ralph-state.md.

6. Proceed to Step 7 (Planning Phase).

## Step 7: P2 — Planning + Plan Review

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P2", status: "in_progress" })`

### 7a. Planning

Notify the planner (already spawned in Step 5) to begin planning:
```
SendMessage({
  to: "planner",
  message: "[Orchestrator] Research phase complete. Begin planning for iteration {N}.\n\nRead research findings in {session_dir}/doc/ and create iter-{N}-plan.md.\nYou may message historian or researcher for clarification.",
  summary: "Start planning"
})
```

Set `status: waiting` in ralph-state.md frontmatter after sending the message to the planner.

The planner:
- Reads research findings and iteration history
- Can message historian/researcher for clarification on findings
- **Estimates work size** and splits across multiple executers when a single executer's ~200k context window would be insufficient — even for dependent tasks, splitting with clear handoff points is preferred over context exhaustion
- Writes `{session_dir}/iter-{N}-plan.md` with a `## Executer Assignments` section specifying how many executers are needed, what each one does, and their dependencies

Wait for the planner to report completion via SendMessage. When it arrives, set `status: active`.

### 7b. Plan Review

After the planner finishes, send the plan to the reviewer:
```
SendMessage({
  to: "reviewer",
  message: "[Orchestrator] Plan for iteration {N} is ready. Please review:\n\n1. Read {session_dir}/iter-{N}-plan.md\n2. Read {session_dir}/team-loop-target.md for acceptance criteria\n3. Validate:\n   - Is the plan feasible and well-scoped?\n   - Does it avoid previously failed approaches? (Check ## Iteration History)\n   - Are the executer assignments reasonable?\n   - Are there gaps or risks?\n\nReturn: APPROVE or REQUEST_CHANGES: {specific feedback}",
  summary: "Requesting plan review"
})
```

Set `status: waiting` in ralph-state.md frontmatter after sending to the reviewer. Wait for the reviewer's response. When it arrives, set `status: active`.

- **If APPROVE**: proceed.
- **If REQUEST_CHANGES**: relay the reviewer's feedback to the planner:
  ```
  SendMessage({
    to: "planner",
    message: "[Orchestrator] Reviewer requested changes:\n{reviewer feedback}\n\nPlease revise iter-{N}-plan.md and report when done.",
    summary: "Relaying plan review feedback"
  })
  ```
  Wait for the planner to revise, then re-submit to the reviewer. Repeat up to 2 times. If still not approved after 2 revisions, proceed with the latest plan and note the risk.

### 7c. Finalize

1. Read `{session_dir}/iter-{N}-plan.md` to extract the `## Executer Assignments` section.
2. **Update progress**:
   - `TaskUpdate({ taskId: "iter-{N}-P2", status: "completed" })`
   - Update `phase` in ralph-state.md frontmatter to `p3`.
3. Proceed to Step 8 (Execution Phase).

## Step 8: P3 — Execution Phase

Mark the task as in progress: `TaskUpdate({ taskId: "iter-{N}-P3", status: "in_progress" })`

### Spawn Executers from Plan

Read the `## Executer Assignments` section from `{session_dir}/iter-{N}-plan.md`. Parse each executer's assignment and dependencies.

- **Single executer plan**: Spawn one `executer-1` with the full plan.
- **Multiple executer plan**: Spawn executers respecting their dependency order:
  - **Independent executers** (no dependencies): spawn all in parallel.
  - **Dependent executers** (e.g., `executer-2` depends on `executer-1`): spawn `executer-1` first. When `executer-1` reports completion, read its execution summary (`iter-{N}-execution-1.md`) and spawn `executer-2` with the following additional context in its prompt:
    ```
    ## Handoff from executer-1
    - Execution summary: {session_dir}/iter-{N}-execution-1.md
    - Files created/modified: {list from execution summary}
    - Key interfaces/contracts: {any new types, APIs, or data structures executer-2 needs to use}
    ```

Use the **Executer** template from `references/spawn-templates.md`, customizing each executer's prompt with their specific plan items.

### Execution with Research Support

During execution, executers can request external research from the researcher:
```
// Executer sends to researcher:
SendMessage({ to: "researcher", message: "Need help: {question about API, library, pattern, etc.}", summary: "Research request from executer" })
// Researcher responds directly:
SendMessage({ to: "executer-1", message: "Here's what I found: {research results}", summary: "Research response" })
```

The orchestrator monitors progress. If an executer is blocked waiting for research, nudge the researcher.

### After All Executers Complete

Set `status: waiting` in ralph-state.md frontmatter after spawning executers. Wait for all executers to report completion via SendMessage (respecting dependency order — dependent executers are spawned sequentially). When all executers have reported, set `status: active`.

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
  to: "reviewer",
  message: "[Orchestrator] Iteration {N} execution is complete. Please review:\n\n1. Read {session_dir}/iter-{N}-plan.md for what was planned\n2. Read all execution summaries in {session_dir}/iter-{N}-execution*.md\n3. {if worktree_mode: Examine the changes in {worktree_path}}\n4. Read {session_dir}/team-loop-target.md for the acceptance criteria\n\nValidate:\n- Does the implementation match the plan?\n- Are there obvious bugs, security issues, or edge cases?\n- Does the code follow project conventions?\n\nReturn: PASS or FAIL: {specific reasons}",
  summary: "Requesting iteration review"
})
```

Set `status: waiting` in ralph-state.md frontmatter after sending to the reviewer. Wait for the reviewer's response. When it arrives, set `status: active`.

Then run the verification method from team-loop-target.md:
```bash
{if worktree_mode: cd "{worktree_path}" &&} {verification_command}
```

### Loop Decision

Evaluate both the reviewer's verdict and the verification result. There are **3 possible branches**:

**Branch 1 — PASS (both reviewer approves AND verification succeeds):**
- `TaskUpdate({ taskId: "iter-{N}-P4", status: "completed" })`
- Proceed to Step 10 (Completion — Success).

**Branch 2 — FAIL:**
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
- Increment `iteration` in ralph-state.md frontmatter (N+1).
- Update `phase` in ralph-state.md to `p1` (loop back to Research).
- Set `status: active` in ralph-state.md (so the Stop hook re-injects the prompt for the next iteration).
- Output status summary:
  ```
  Team-loop iteration {N}/{max_iterations} complete. Problem not yet resolved.
  Approach tried: {summary}
  Verification failure: {reason}
  {if worktree_mode: Branch so far: {worktree_branch} — use `git log {worktree_branch}` to review attempts.}
  Next iteration will try a different approach.
  ```
- The Stop hook will re-inject the prompt to continue the loop.

**Branch 3 — Max iterations reached:**
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
   SendMessage({ to: "historian", message: "Loop complete — shutting down", summary: "Shutdown" })
   SendMessage({ to: "researcher", message: "Loop complete — shutting down", summary: "Shutdown" })
   SendMessage({ to: "planner", message: "Loop complete — shutting down", summary: "Shutdown" })
   SendMessage({ to: "reviewer", message: "Loop complete — shutting down", summary: "Shutdown" })
   // Also shutdown all executers (executer-1, executer-2, etc.)
   ```

3. **Delete team**:
   ```
   TeamDelete()
   ```

4. **Exit worktree with `keep`** (do NOT remove — the user decides when to clean up):
   ```
   ExitWorktree({ action: "keep" })
   ```

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

7. **Backlog Offer:**
   Ask the user if any deferred items from this session should be added to the backlog:
   ```
   AskUserQuestion({
     questions: [{
       question: "Were there any follow-up tasks, improvements, or deferred work from this team-loop session that should be added to the backlog for later?",
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

### Failure (Branch 3 — max iterations reached)

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
1. The teammate should have saved a checkpoint before running out of context (same pattern as `execute/ORIGINAL.md`).
2. Follow the **Teammate Failure** recovery process above.
3. If the orchestrator itself is running low on context, output a status summary and let the Stop hook re-inject the prompt for a fresh context window. The state file and session files preserve all necessary state.

### Cancellation

Cancel an active team-loop session with:
```
/workflow-adapter:team-loop-cancel {subject}
```

The cancel skill reads `ralph-state.md`, verifies `type: phased-loop`, cleans up the worktree, deletes the state file, and attempts TeamDelete for any active team.
