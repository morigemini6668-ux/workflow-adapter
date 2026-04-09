---
name: supervisor
description: |
  Launch a Claude Code orchestrator in a tmux pane and drive the full workflow
  (brainstorming → spec → plan → execute) end-to-end via send-keys. The supervisor
  monitors each phase, reviews artifacts between phases, and handles errors.
  Use this skill when the user asks to "supervise", "run full workflow",
  "전체 워크플로우 실행", "end-to-end", "brainstorming부터 execute까지",
  "supervisor 띄워", "워크플로우 자동화", or wants to automate the complete
  workflow pipeline without manually triggering each phase. Requires running
  inside a tmux session.
argument-hint: "<subject description> [--from brainstorming|spec|plan|execute] [--no-review] [--worktree]"
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# Supervisor: End-to-End Workflow Controller

tmux pane에 Claude Code orchestrator를 띄우고, paste-buffer 방식의 send-keys로
brainstorming → spec → plan → execute 전체 워크플로우를 자동 제어한다.

## Setup

**Do NOT explain or plan. Start setup immediately when this skill triggers.**

Find the `pane-ctl.sh` helper script:

```bash
P=""
for DIR in "${CLAUDE_PLUGIN_ROOT}" "$(git rev-parse --show-toplevel 2>/dev/null)/plugins/workflow-adapter"; do
  [ -n "$DIR" ] && [ -x "$DIR/scripts/supervisor/pane-ctl.sh" ] && P="$DIR/scripts/supervisor/pane-ctl.sh" && break
done
if [ -n "$P" ]; then echo "READY: $P"; else echo "NOT_FOUND"; fi
```

If `NOT_FOUND`: check `${CLAUDE_PLUGIN_ROOT}/scripts/supervisor/pane-ctl.sh`.

Store the path as `$P` for all subsequent commands.

Verify tmux is available:
```bash
tmux display-message -p '#{session_name}' 2>/dev/null || echo "NOT_IN_TMUX"
```
If `NOT_IN_TMUX`: tell the user they must run this inside a tmux session and stop.

## Step 0: Parse Arguments

Extract from `$ARGUMENTS`:
- **subject**: the workflow subject (everything except flags)
- **--from \<phase\>**: start from this phase (default: `brainstorming`)
  - Valid: `brainstorming`, `spec`, `plan`, `execute`
- **--no-review**: skip artifact review between phases
- **--worktree**: tell orchestrator to use worktree isolation for execute

If no subject provided, ask the user:
```
AskUserQuestion({
  questions: [{
    question: "What subject should the workflow cover?",
    header: "Supervisor"
  }]
})
```

## Step 1: Launch Orchestrator

### 1.1 Locate instruction file

```bash
INST="${CLAUDE_PLUGIN_ROOT}/scripts/supervisor/orchestrator-instructions.md"
[ -f "$INST" ] && echo "FOUND: $INST" || echo "NOT_FOUND"
```

### 1.2 Create pane

Launch a Claude Code instance in a new tmux pane. The orchestrator runs in the
user's current working directory so it has access to the project files.

```bash
CWD="$(pwd)"
PANE_ID=$($P launch "$CWD" "claude --dangerously-skip-permissions --append-system-prompt-file $INST")
echo "PANE_ID=$PANE_ID"
```

Save `$PANE_ID` — you'll use it for every subsequent command.

### 1.3 Wait for ready

The orchestrator needs time to initialize. Trust prompts are auto-dismissed.

```bash
$P wait-ready $PANE_ID 120
```

If `STATUS:timeout`: the orchestrator may still be loading plugins. Try a manual check:
```bash
$P state $PANE_ID
$P capture $PANE_ID 20
```
If state is "idle" or the capture shows the Claude Code welcome screen, proceed anyway.
If `STATUS:dead`: report the error and stop.

### 1.4 Start logging

```bash
SESSION_DIR=".workflow-adapter/supervisor-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SESSION_DIR"
$P log-start $PANE_ID "$SESSION_DIR/orchestrator.log"
```

Report to user: "Orchestrator launched in pane `$PANE_ID`. Session log: `$SESSION_DIR/orchestrator.log`"

## Step 2: Run Phases

Execute phases in order: **brainstorming → spec → plan → execute**.
Skip phases before the `--from` phase.

For each phase, follow the Phase Execution Pattern below.

### Phase Execution Pattern

For every phase:

1. **Send command** to orchestrator
2. **Monitor** until idle
3. **Verify** artifact was created
4. **Review** artifact (unless `--no-review`)
5. **Report** to user and proceed

### Phase Commands

| Phase | Command | Expected Artifact |
|-------|---------|-------------------|
| brainstorming | `/brainstorming {subject}` | `.workflow-adapter/{slug}/brainstorming.md` |
| spec | `/spec` | `.workflow-adapter/{slug}/spec.md` |
| plan | `/plan` | `.workflow-adapter/{slug}/plan.md` |
| execute | `/execute` | Plan tasks marked `[x]` in plan.md |

**`{slug}`** is the kebab-case directory name the orchestrator creates for the subject.
After brainstorming completes, discover it:
```bash
ls -td .workflow-adapter/*/brainstorming.md 2>/dev/null | head -1
```

### Sending a Command

The orchestrator runs **without `--yes`**. It makes its own decisions autonomously
thanks to the orchestrator-instructions.md system prompt. Do NOT add `--yes` to commands.

```bash
$P send-submit $PANE_ID "/brainstorming My awesome project"
```

### Monitoring: File-Watching (preferred)

Use `wait-file` with `run_in_background` for event-driven phase detection.
This avoids polling latency and false idle issues.

For phases that produce a file artifact (brainstorming, spec, plan):

```bash
# Run in background — you'll be notified when the artifact appears
$P wait-file ".workflow-adapter/{slug}/brainstorming.md" 1800
```

Run this Bash command with `run_in_background: true` and `timeout: 600000`.
While waiting, you can check the orchestrator's progress periodically:

```bash
$P capture $PANE_ID 20
```

When the background command completes with `STATUS:found`, the phase is done.
If `STATUS:timeout`, check the orchestrator state for errors.

For the **execute** phase (no single artifact), fall back to state polling:

```bash
$P state $PANE_ID
$P capture $PANE_ID 20
```

Check plan.md task markers (`[x]` vs `[ ]`) to gauge progress. The orchestrator
returns to idle when all tasks are complete.

### Monitoring: State Polling (fallback)

If `wait-file` isn't suitable, poll the orchestrator state.

**Critical: avoid false idle detection.**
After sending a command, the orchestrator's pane briefly shows `❯` before the
model starts processing. If you check state too early, you get a false "idle".

1. **Initial wait**: sleep 60 seconds after sending a command
2. **Check state**: `$P state $PANE_ID`
3. **Verify**: even if "idle", always capture and check for actual activity:
   ```bash
   $P capture $PANE_ID 20
   ```
   If the capture shows only the command you just sent (no tool calls, no output),
   the orchestrator hasn't started yet — wait 30 more seconds.

**Polling pattern — repeat until phase complete:**

- **busy** / **unknown** → capture for progress, report status, `sleep 60`, repeat
- **idle** → verify artifact exists. If yes, phase done. If no, see below.
- **dead** → Error Handling

**If idle but no artifact:**
1. Capture: `$P capture $PANE_ID 60`
2. Check for errors or pending questions in the output
3. The orchestrator may have auto-triggered the next phase (e.g., brainstorming
   completed and spec started automatically). Check for ALL expected artifacts.
4. If stuck after 3 retries: report to the user.

### Artifact Verification

After the orchestrator goes idle, verify the expected artifact:

```bash
# For brainstorming/spec/plan:
ls -t .workflow-adapter/*/brainstorming.md 2>/dev/null | head -1

# For execute: check plan.md for completion
grep -c '\[x\]' .workflow-adapter/*/plan.md 2>/dev/null
grep -c '\[ \]\|\[~\]\|\[!\]' .workflow-adapter/*/plan.md 2>/dev/null
```

If the artifact doesn't exist and the orchestrator is idle:
1. Capture the pane: `$P capture $PANE_ID 40`
2. Analyze the output for errors or questions
3. If error: see Error Handling
4. If question: answer it and resume monitoring
5. If unclear: ask the user for guidance

### Artifact Review (unless --no-review)

Between phases, read the generated artifact and do a quick quality check.
This is the supervisor's value — catching issues before they cascade.

**Brainstorming review:**
- Read `brainstorming.md`
- Check: Decision Registry exists with clear D1, D2... entries
- Check: each decision has status (accepted/rejected/open)
- If critical issues: send correction to orchestrator, or report to user

**Spec review:**
- Read `spec.md`
- Check: covers all accepted decisions from brainstorming
- Check: has Interface Contracts, Acceptance Criteria sections
- Check: Decision Registry IDs continue from brainstorming

**Plan review:**
- Read `plan.md`
- Check: all tasks have Completion Criteria
- Check: Decision Traceability section covers all spec decisions
- Check: `worker.md` exists with executer assignments

**Execute review:**
- Read `plan.md` task statuses
- Check git log for commits
- Verify no tasks stuck in `[!]` blocked state

Report findings to the user as a brief summary after each phase.

## Step 3: Completion

When all phases finish (or the last requested phase completes):

1. Capture final orchestrator output:
   ```bash
   $P capture $PANE_ID 40
   ```

2. Stop logging:
   ```bash
   $P log-stop $PANE_ID
   ```

3. Kill the orchestrator pane:
   ```bash
   $P kill $PANE_ID
   ```

4. Report final summary to user:
   - Which phases completed
   - Key decisions from brainstorming
   - Spec scope summary
   - Plan task count and completion rate
   - Execute results (commits, branch name if worktree)
   - Session log location

## Error Handling

### Orchestrator Died

If `state` returns `dead`:
1. Read the log file: `$SESSION_DIR/orchestrator.log`
2. Report the error to the user
3. Ask if they want to relaunch and retry the current phase:
   ```
   AskUserQuestion({
     questions: [{
       question: "Orchestrator crashed during {phase}. Relaunch and retry?",
       header: "Supervisor Error",
       options: [
         { label: "Retry", description: "Relaunch orchestrator and retry the phase" },
         { label: "Abort", description: "Stop the workflow here" }
       ]
     }]
   })
   ```
4. If retry: go back to Step 1 (Launch Orchestrator), then send the failed phase command
5. If abort: clean up and report what was completed

### Phase Timeout

If a phase takes unreasonably long (>30 min for brainstorming/spec/plan, >120 min for execute):
1. Capture pane for diagnosis
2. Report to user with the capture content
3. Ask if they want to continue waiting, interrupt, or abort

### Stuck Orchestrator

If the orchestrator is idle but no artifact was produced and no question is visible:
1. Try nudging: `$P send-submit $PANE_ID "continue"`
2. Wait 30 seconds and check again
3. If still stuck: capture full pane, report to user, ask for guidance

## Tips

- The orchestrator runs with `--dangerously-skip-permissions` — all tool calls are auto-approved
- The orchestrator-instructions.md makes it an autonomous decision-maker.
  It evaluates options and makes choices on its own — no `--yes` flags needed.
- If you need to see what the orchestrator is doing in real-time, tell the user to
  switch to the orchestrator's tmux pane
- The brainstorming phase spawns teammates (historian, researcher, reviewer) internally —
  this is normal and the supervisor doesn't need to manage them
- For very large projects, the execute phase may spawn multiple executer teammates
  and take significant time — be patient and report progress
