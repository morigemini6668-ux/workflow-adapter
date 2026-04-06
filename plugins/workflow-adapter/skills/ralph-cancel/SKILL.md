---
name: ralph-cancel
description: Cancels an active Ralph Wiggum execution loop by removing the state file. Prints a summary of loop progress before deletion.
argument-hint: "<subject>"
disable-model-invocation: true
---

You are the **Ralph-Cancel** skill. Your job is to cleanly cancel an active Ralph execution loop.

## Step 1: Find Active State Files

Use the Glob tool to search for `.workflow-adapter/*/ralph-state.md` files.

If **no files are found**:
- Output: "No active Ralph loop found."
- Stop here.

If **multiple files are found** (unusual but possible if something went wrong):
- List all found state files and their subjects.
- Use AskUserQuestion to ask: "Multiple Ralph state files found: {list}. Which subject's loop should be cancelled? (Or type 'all' to cancel all.)"
- Proceed based on the user's answer.

## Step 2: Read State File

For each state file to cancel, read it to extract:
- `type` — session type (`autopilot`, `execute`, `debug`)
- `iteration` — current iteration number
- `max_iterations` — configured maximum
- `subject` — the workflow subject name
- `started_at` — when the loop was started
- `worktree_path` — (autopilot only) path to the isolated git worktree, if present
- `worktree_branch` — (autopilot only) name of the worktree branch, if present
- `session_dir` — absolute path to `.workflow-adapter/{subject}` in the main repo, if present

## Step 3: Output Cancellation Summary

Before deleting anything, output a summary based on the session type:

**If `type: autopilot`:**
Read `{session_dir}/autopilot-target.md` (or `.workflow-adapter/{subject}/autopilot-target.md` if `session_dir` is not in state) and count entries in `## Iteration History`.
```
Cancelling autopilot-ralph loop for '{subject}'
- Iterations completed: {count from Iteration History}/{max_iterations}
- Started: {started_at}
{if worktree_path: - Worktree: {worktree_path} (branch: {worktree_branch})}
```

**If `type: execute` or `type: debug`:**
Read `.workflow-adapter/{subject}/plan.md` to count:
- Total tasks (any task with a `[x]`, `[ ]`, `[~]`, or `[!]` marker)
- Completed tasks (tasks marked `[x]`)
Also check the `## Loop State` section of plan.md (if present) for the last reviewer verdict.
```
Cancelling Ralph loop for '{subject}'
- Iterations completed: {iteration}/{max_iterations}
- Tasks completed: {x_count}/{total_count}
- Started: {started_at}
- Last reviewer result: {PASS | NEEDS REVISION | not yet reviewed}
```

## Step 4: Delete the State File and Clean Up Worktree

Delete the state file:
```bash
rm ".workflow-adapter/{subject}/ralph-state.md"
```

Verify the file no longer exists. If deletion fails, output the error and ask the user to delete it manually.

**If in a worktree session (EnterWorktree was used):**

First commit any uncommitted changes to preserve work:
```bash
git add -A && git status
# If there are changes:
git commit -m "{subject}: save work before cancel"
```

Then ask the user whether to keep or remove:
```
AskUserQuestion({ questions: [{ question: "Keep the worktree and branch '{worktree_branch}' for later review, or remove it?", options: [{ label: "Keep" }, { label: "Remove" }] }] })
```
- If Keep: `ExitWorktree({ action: "keep" })`
- If Remove: `ExitWorktree({ action: "remove" })` — the tool will refuse if uncommitted changes remain. **NEVER pass `discard_changes: true` unless the user explicitly says to discard.**

If not in a worktree session but `worktree_path` exists on disk, inform the user and let them clean up manually.

## Step 5: Confirm Cancellation

Output: "Ralph loop cancelled for '{subject}'. The session will now end normally."

If the user had previously been mid-loop (the Stop hook was keeping the session alive), the loop will not continue after this cancellation.
