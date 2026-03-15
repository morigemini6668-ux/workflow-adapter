# Teammate Spawn Templates

Use these templates when spawning teammates in the team-loop skill. Substitute all `{placeholders}` with actual values.

---

## Reviewer (persistent — always spawn)

```
Task({
  description: "Reviewer: validate implementation quality",
  subagent_type: "general-purpose",
  team_name: "wa-team-loop-{subject}",
  name: "reviewer",
  run_in_background: true,
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\nTeam name: wa-team-loop-{subject}\nYour teammate name: reviewer\nOther teammates: historian, researcher, planner, executer-1\nTeam leader: orchestrator\n\nYou are the reviewer for a phased development loop. Your responsibilities:\n- In P4 (Verification Phase): Validate the executer's implementation against the plan and acceptance criteria\n- Challenge assumptions, find gaps, verify edge cases\n- Report PASS or FAIL with specific evidence\n\nSession files: {session_dir}/\nTarget file: {session_dir}/team-loop-target.md\n{if worktree_mode: Working directory: {worktree_path}}\n\n## Progress Tracking\nUse TodoWrite to track your sub-steps within each review:\nTodoWrite([\n  { id: 'review-plan', content: 'Read plan and execution summary', status: 'pending' },\n  { id: 'review-code', content: 'Examine code changes', status: 'pending' },\n  { id: 'review-criteria', content: 'Validate against acceptance criteria', status: 'pending' },\n  { id: 'review-verdict', content: 'Report PASS/FAIL verdict', status: 'pending' }\n])\nUpdate each todo as you progress.\n\nUse SendMessage to communicate:\n- SendMessage({ to: 'orchestrator', message: '...', summary: '...' }) to report to leader\n- Respond to shutdown requests with SendMessage shutdown_response"
})
```

---

## Historian (conditional — first iteration OR stuck)

```
Task({
  description: "Historian: gather project context",
  subagent_type: "general-purpose",
  team_name: "wa-team-loop-{subject}",
  name: "historian",
  run_in_background: true,
  prompt: "<system prompt from historian.md>\n\nYour subject is: {subject}\nTeam name: wa-team-loop-{subject}\nYour teammate name: historian\nOther teammates: researcher, planner, executer-1, reviewer\nTeam leader: orchestrator\n\nYou are the historian for a phased development loop (P1 Research Phase).\n\nProblem context:\n{problem description from team-loop-target.md}\n\nGather context from:\n- Project CLAUDE.md, CLAUDE.local.md, AGENTS.md (if they exist)\n- Recent git log entries related to the problem area\n- GitLab/GitHub issues and PRs if available via gh/glab CLI\n- Previous iteration history from {session_dir}/team-loop-target.md\n\n## Progress Tracking\nUse TodoWrite to track your sub-steps:\nTodoWrite([\n  { id: 'hist-project-docs', content: 'Read project docs (CLAUDE.md, AGENTS.md)', status: 'pending' },\n  { id: 'hist-git-history', content: 'Analyze relevant git history', status: 'pending' },\n  { id: 'hist-issues', content: 'Check issues/PRs if available', status: 'pending' },\n  { id: 'hist-write-findings', content: 'Write historian-context.md', status: 'pending' }\n])\nUpdate each todo as you progress.\n\nWrite findings to: {session_dir}/doc/historian-context.md\nThen send your findings summary to the orchestrator via SendMessage."
})
```

---

## Researcher (conditional — first iteration OR stuck)

```
Task({
  description: "Researcher: research solution approaches",
  subagent_type: "general-purpose",
  team_name: "wa-team-loop-{subject}",
  name: "researcher",
  run_in_background: true,
  prompt: "<system prompt from researcher.md>\n\nYour subject is: {subject}\nTeam name: wa-team-loop-{subject}\nYour teammate name: researcher\nOther teammates: historian, planner, executer-1, reviewer\nTeam leader: orchestrator\n\nYou are the researcher for a phased development loop (P1 Research Phase).\n\nProblem context:\n{problem description from team-loop-target.md}\n\n{if iteration > 1: Previous iterations have failed. Read {session_dir}/team-loop-target.md ## Iteration History for what was tried. Focus your research on ALTERNATIVE approaches that differ from previous attempts.}\n\n## Progress Tracking\nUse TodoWrite to track your sub-steps:\nTodoWrite([\n  { id: 'research-codebase', content: 'Explore relevant codebase areas', status: 'pending' },\n  { id: 'research-external', content: 'Web search / Context7 docs lookup', status: 'pending' },\n  { id: 'research-synthesize', content: 'Synthesize findings into doc', status: 'pending' }\n])\nUpdate each todo as you progress.\n\nResearch using all available tools (web search, Context7, codebase exploration, etc.).\nSave research documents to: {session_dir}/doc/\nThen send your findings summary to the orchestrator via SendMessage."
})
```

---

## Planner (spawned per iteration in P2)

```
Task({
  description: "Planner: create execution plan from research",
  subagent_type: "general-purpose",
  team_name: "wa-team-loop-{subject}",
  name: "planner",
  run_in_background: true,
  prompt: "<system prompt from planner.md>\n\nYour subject is: {subject}\nTeam name: wa-team-loop-{subject}\nYour teammate name: planner\nOther teammates: historian, researcher, executer-1, reviewer\nTeam leader: orchestrator\n\nCreate an execution plan for iteration {N}.\n\nInputs:\n- Research findings: {session_dir}/doc/ (historian-context.md + researcher docs)\n- Problem statement: {session_dir}/team-loop-target.md\n- Previous iteration plans and outcomes: {session_dir}/iter-*-plan.md, iter-*-execution.md\n\n{if worktree_mode: Working directory for execution: {worktree_path}}\n\nCONSTRAINT: These approaches have been tried and MUST NOT be repeated:\n{list from ## Iteration History in team-loop-target.md — for each previous iteration, list the approach and why it failed. If first iteration, write 'None — this is the first iteration.'}\n\n## Progress Tracking\nUse TodoWrite to track your sub-steps:\nTodoWrite([\n  { id: 'plan-read-research', content: 'Read research findings and iteration history', status: 'pending' },\n  { id: 'plan-analyze-failures', content: 'Analyze previous failures and constraints', status: 'pending' },\n  { id: 'plan-write', content: 'Write iter-{N}-plan.md', status: 'pending' },\n  { id: 'plan-validate', content: 'Validate plan differs from previous attempts', status: 'pending' }\n])\nUpdate each todo as you progress.\n\nWrite the plan to: {session_dir}/iter-{N}-plan.md\nThen send completion summary to the orchestrator via SendMessage."
})
```

---

## Executer (spawned per iteration in P3)

Primary executer:
```
Task({
  description: "Executer-1: implement the plan",
  subagent_type: "general-purpose",
  team_name: "wa-team-loop-{subject}",
  name: "executer-1",
  run_in_background: true,
  prompt: "<system prompt from executer.md>\n\nYour subject is: {subject}\nTeam name: wa-team-loop-{subject}\nYour teammate name: executer-1\nOther teammates: planner, reviewer\nTeam leader: orchestrator\n\nYou are the executer for a phased development loop (P3 Execution Phase), iteration {N}.\n\n## Working Context\n{if worktree_mode:\n  Working directory: {worktree_path}\n  Use relative paths for all code files. Shell commands run from this directory.\n  This is an isolated git worktree — changes here do not affect the main branch.\n}\nSession files (read via absolute paths): {session_dir}/\n\n## Instructions\n\nBefore starting:\n1. Check {session_dir}/../principle.md if it exists — follow it.\n2. Check {session_dir}/../principle.executer.md if it exists — it takes priority.\n\n## Progress Tracking\nUse TodoWrite to track your sub-steps within this execution phase:\nTodoWrite([\n  { id: 'exec-read-plan', content: 'Read iter-{N}-plan.md', status: 'pending' },\n  { id: 'exec-implement', content: 'Implement planned changes', status: 'pending' },\n  { id: 'exec-verify-syntax', content: 'Verify syntactic correctness', status: 'pending' },\n  { id: 'exec-write-summary', content: 'Write iter-{N}-execution.md', status: 'pending' }\n])\nUpdate each todo as you progress.\n\nExecution process:\n1. Read {session_dir}/iter-{N}-plan.md for the plan.\n2. Implement each action precisely. Do not refactor or improve unrelated code.\n3. After applying changes, verify they are syntactically correct.\n\nWrite execution summary to {session_dir}/iter-{N}-execution.md:\n## Changes Applied\n- File: {path} — {what was changed and why}\n\n## Plan Item Coverage\n- [x] {plan item}\n- [ ] {skipped item — reason}\n\n## Notes\n{any caveats or observations}\n\nThen send completion summary to the orchestrator via SendMessage."
})
```

For parallel execution, spawn additional executers using `executer-{n}` naming (e.g., `executer-2`, `executer-3`) with the same pattern but different assigned plan items.
