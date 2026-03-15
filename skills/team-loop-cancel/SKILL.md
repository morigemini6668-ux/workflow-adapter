---
name: team-loop-cancel
description: Cancels an active team-loop execution session by cleaning up the team, worktree, and state file. Prints a summary before deletion.
argument-hint: "<subject>"
disable-model-invocation: true
---

You are the **Team-Loop-Cancel** skill. Your job is to cleanly cancel an active team-loop (phased-loop) execution session.

## Step 1: Find Active State Files

Use the Glob tool to search for `.workflow-adapter/*/ralph-state.md` files.

If **no files are found**:
- Output: "No active loop found."
- Stop here.

If **multiple files are found**:
- Filter to only those with `type: phased-loop` in their frontmatter.
- If none match after filtering: Output "No active team-loop session found." and stop.
- If multiple match: List all found state files and their subjects. Use AskUserQuestion to ask: "Multiple team-loop sessions found: {list}. Which subject's session should be cancelled? (Or type 'all' to cancel all.)"
- Proceed based on the user's answer.

If a `<subject>` argument was provided, look specifically for `.workflow-adapter/{subject}/ralph-state.md`.

## Step 2: Read and Validate State File

For each state file to cancel, read it and extract:
- `type` — must be `phased-loop`. If the type is NOT `phased-loop`, output: "State file for '{subject}' is type '{type}', not a team-loop session. Use the appropriate cancel skill instead." and skip this file.
- `iteration` — current iteration number
- `max_iterations` — configured maximum
- `phase` — current phase (p0/p1/p2/p3/p4)
- `subject` — the workflow subject name
- `started_at` — when the session was started
- `worktree_path` — path to the git worktree, if present
- `worktree_branch` — name of the worktree branch, if present
- `session_dir` — absolute path to `.workflow-adapter/{subject}/`
- `team_name` — the team name for TeamDelete

## Step 3: Output Cancellation Summary

Before deleting anything, output a summary:

```
Cancelling team-loop session for '{subject}'
- Phase: {phase}
- Iterations completed: {iteration}/{max_iterations}
- Started: {started_at}
{if worktree_path: - Worktree: {worktree_path} (branch: {worktree_branch})}
{if team_name: - Team: {team_name}}
```

## Step 4: Delete Team

If `team_name` is present in the state file, attempt to clean up the team. Note: `TeamDelete()` operates on the current session's team context and takes no parameters. If this cancel skill is running in a different session than the one that created the team, the team may not be deletable from here.

Try:
```
TeamDelete()
```

If TeamDelete fails (e.g., team belongs to another session, already deleted, or doesn't exist), log the warning but continue — this is not fatal. The team will be cleaned up when the owning session ends. Output: "Note: Could not delete team '{team_name}' — it may belong to another session."

## Step 5: Delete State File and Clean Up Worktree

Delete the state file:
```bash
rm ".workflow-adapter/{subject}/ralph-state.md"
```

Verify the file no longer exists. If deletion fails, output the error and ask the user to delete it manually.

**If `worktree_path` was found in the state file:**
```bash
git worktree remove --force "{worktree_path}"
git branch -D "{worktree_branch}"
```
(`--force` is used because the worktree may have uncommitted changes at the time of cancellation.)

If the worktree directory no longer exists, skip `git worktree remove` and only run `git branch -D`.
If the branch doesn't exist, skip `git branch -D` as well.

## Step 6: Confirm Cancellation

Output: "Team-loop session cancelled for '{subject}'. All resources cleaned up."

If the user had previously been mid-session (the stop hook was keeping the session alive), the loop will not continue after this cancellation.
