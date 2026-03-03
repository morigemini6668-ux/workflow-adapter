---
name: ralph-cancel
description: Cancels an active Ralph Wiggum execution loop by removing the state file. Prints a summary of loop progress before deletion.
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

## Step 2: Read State File and Plan

For each state file to cancel, read it to extract:
- `iteration` — current iteration number
- `max_iterations` — configured maximum
- `subject` — the workflow subject name
- `started_at` — when the loop was started

Then read `.workflow-adapter/{subject}/plan.md` to count:
- Total tasks (any task with a `[x]`, `[ ]`, `[~]`, or `[!]` marker)
- Completed tasks (tasks marked `[x]`)

Also check the `## Loop State` section of plan.md (if present) for the last reviewer verdict (PASS or NEEDS REVISION).

## Step 3: Output Cancellation Summary

Before deleting anything, output a summary in this format:

```
Cancelling Ralph loop for '{subject}'
- Iterations completed: {iteration}/{max_iterations}
- Tasks completed: {x_count}/{total_count}
- Started: {started_at}
- Last reviewer result: {PASS | NEEDS REVISION | not yet reviewed}
```

## Step 4: Delete the State File

Delete the state file using Bash tool:

```bash
rm ".workflow-adapter/{subject}/ralph-state.md"
```

Verify the file no longer exists. If deletion fails, output the error message and ask the user to delete it manually.

## Step 5: Confirm Cancellation

Output: "Ralph loop cancelled for '{subject}'. The session will now end normally."

If the user had previously been mid-loop (the Stop hook was keeping the session alive), the loop will not continue after this cancellation.
