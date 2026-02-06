---
description: Check team execution status
argument-hint: "[team-name]"
allowed-tools: [Read, TaskList, TaskGet, Glob]
---

Check the status of a running teammate execution.

## Arguments
- `$1`: Team name (optional) - if not provided, auto-detect from running teams

## Tasks to Perform

### 1. Detect Active Teams
If no team name provided, look for active team configurations:
- Use Glob to check `~/.claude/teams/wa-*/config.json`
- List all found teams

If team name is provided, use it directly.

### 2. Read Team Configuration
Read the team config file: `~/.claude/teams/{team-name}/config.json`

Extract:
- Team members (name, agentType, status)
- Team description

### 3. Read Task Status
Use `TaskList` to get all tasks for the team.

For each task, note:
- Task ID, subject, status
- Owner (assigned agent)
- Blocked by (dependencies)

### 4. Display Status Report

```
Team Status: {team-name}
═══════════════════════════════

Members:
  {name} ({agentType}) - {idle/active}
  ...

Tasks:
  Total: {count} | Completed: {done} | In Progress: {in_progress} | Pending: {pending} | Blocked: {blocked}

  Progress: [{bar}] {percentage}%

Task Details:
  #{id} [{status}] {subject} → {owner}
  #{id} [{status}] {subject} → {owner} (blocked by: #{dep_id})
  ...

{If blocked tasks exist:}
Blocked Tasks:
  #{id}: {subject} - waiting on #{dep_id} ({dep_subject})
```

### 5. Suggestions
Based on status, provide suggestions:
- If tasks are blocked: suggest checking blocking task status
- If all complete: suggest running cleanup
- If in progress: show estimated completion based on done/total ratio
