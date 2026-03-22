---
name: backlog
description: This skill should be used when the user asks to "backlog add", "backlog list", "backlog consume", "backlog defer", "backlog remove", "백로그 추가", "백로그 보기", "백로그 목록", "백로그 소비", "백로그 처리", "백로그 미루기", "백로그 삭제", "deferred items", "보류 항목", or wants to manage deferred work items that persist across workflow sessions. Backlog items track tasks, principle changes, and environment changes that were identified but not addressed in the current session.
---

# Backlog Management for Workflow Adapter

Manage deferred work items that persist across workflow sessions. Backlog items are stored as individual markdown files in `.workflow-adapter/backlog/` and can be created, listed, consumed, deferred, or removed.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Backlog Item Schema

Each backlog item is stored as a separate `.md` file in `.workflow-adapter/backlog/`. Filename format: `{timestamp}-{short-slug}.md` (e.g., `20260322-fix-auth-retry.md`).

```markdown
---
type: task | principle-change | environment-change
status: pending | consumed | deferred
source: {subject name that created this item}
created: {YYYY-MM-DD}
priority: high | medium | low
---

{Description of the deferred item}
```

### Field Definitions

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `task` | A code change, feature, or fix to be done later |
| | `principle-change` | A principle.md update identified during a session |
| | `environment-change` | A tooling, config, or infrastructure change needed |
| `status` | `pending` | Not yet addressed |
| | `consumed` | Picked up and completed in a later session |
| | `deferred` | Explicitly postponed (still pending, but deprioritized) |
| `source` | string | The subject name of the workflow session that created this item |
| `created` | date | ISO date when the item was created |
| `priority` | `high` / `medium` / `low` | Relative priority for triage |

## Step 1: Determine Operation

Parse the user's request to determine the desired operation. If unclear, use AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "What would you like to do with the backlog?",
    header: "Backlog Operation",
    options: [
      { label: "Add", description: "Create a new backlog item for deferred work" },
      { label: "List", description: "View all pending backlog items" },
      { label: "Consume", description: "Mark an item as addressed/completed" },
      { label: "Defer", description: "Explicitly postpone a pending item" },
      { label: "Remove", description: "Delete a backlog item entirely" }
    ],
    multiSelect: false
  }]
})
```

## Operation: Add

### Step A1: Collect Item Details

Use AskUserQuestion to gather the item details:

```
AskUserQuestion({
  questions: [{
    question: "What type of backlog item is this?",
    header: "Item Type",
    options: [
      { label: "Task", description: "A code change, feature, or fix to be done later" },
      { label: "Principle change", description: "A principle.md update identified during a session" },
      { label: "Environment change", description: "A tooling, config, or infrastructure change needed" }
    ],
    multiSelect: false
  }]
})
```

Then ask for priority:

```
AskUserQuestion({
  questions: [{
    question: "What priority level?",
    header: "Priority",
    options: [
      { label: "High", description: "Should be addressed in the next session" },
      { label: "Medium", description: "Important but not urgent" },
      { label: "Low", description: "Nice to have, address when convenient" }
    ],
    multiSelect: false
  }]
})
```

Then ask for a description:

```
AskUserQuestion({
  questions: [{
    question: "Describe the backlog item. What needs to be done and why?",
    header: "Description"
  }]
})
```

### Step A2: Determine Source

If this is being called from within a workflow session (a subject context exists), use that subject as the `source`. Otherwise, ask:

```
AskUserQuestion({
  questions: [{
    question: "Which subject or context did this item come from? (Enter a name, or 'manual' if created outside a workflow)",
    header: "Source"
  }]
})
```

### Step A3: Write the Backlog Item

1. Ensure `.workflow-adapter/backlog/` directory exists
2. Generate a filename: `{YYYYMMDD}-{slug}.md` where slug is a 2-4 word kebab-case summary
3. Write the file with frontmatter and description
4. Confirm creation to the user

## Operation: List

### Step L1: Read Backlog Directory

1. Check if `.workflow-adapter/backlog/` exists
2. If it does not exist or is empty, inform the user: "No backlog items found. The backlog is empty."
3. If items exist, read all `.md` files in the directory

### Step L2: Display Items

Group items by status, then by priority within each group. Display in a table format:

```
## Pending Items

| # | Priority | Type | Source | Created | Description |
|---|----------|------|--------|---------|-------------|
| 1 | high | task | api-refactor | 2026-03-20 | Fix retry logic... |
| 2 | medium | principle-change | auth-fix | 2026-03-19 | Add error handling rule... |

## Deferred Items

| # | Priority | Type | Source | Created | Description |
|---|----------|------|--------|---------|-------------|
| 3 | low | environment-change | ci-setup | 2026-03-15 | Upgrade Node to v22... |

## Consumed Items (completed)

| # | Type | Source | Created | Description |
|---|------|--------|---------|-------------|
| 4 | task | db-migration | 2026-03-10 | Add index to users table... |
```

Show pending items first (sorted by priority: high > medium > low), then deferred, then consumed.

## Operation: Consume

### Step C1: Select Item

1. List all pending and deferred items (same as List operation, but only show actionable items)
2. If no pending/deferred items exist, inform the user: "No actionable backlog items to consume."
3. Use AskUserQuestion to ask which item to mark as consumed:

```
AskUserQuestion({
  questions: [{
    question: "Which item has been addressed? Select by number from the list above.",
    header: "Consume Item"
  }]
})
```

### Step C2: Update Status

1. Read the selected item file
2. Change `status: pending` (or `status: deferred`) to `status: consumed`
3. Write the updated file
4. Confirm to the user

## Operation: Defer

### Step D1: Select Item

1. List all pending items only
2. If no pending items exist, inform the user: "No pending backlog items to defer."
3. Use AskUserQuestion to ask which item to defer:

```
AskUserQuestion({
  questions: [{
    question: "Which pending item would you like to defer? Select by number from the list above.",
    header: "Defer Item"
  }]
})
```

### Step D2: Update Status

1. Read the selected item file
2. Change `status: pending` to `status: deferred`
3. Write the updated file
4. Confirm to the user

## Operation: Remove

### Step R1: Select Item

1. List all backlog items (all statuses)
2. If no items exist, inform the user: "No backlog items to remove."
3. Use AskUserQuestion to ask which item to remove:

```
AskUserQuestion({
  questions: [{
    question: "Which item would you like to permanently remove? This cannot be undone. Select by number from the list above.",
    header: "Remove Item"
  }]
})
```

### Step R2: Confirm and Delete

1. Show the full item content to the user
2. Use AskUserQuestion for final confirmation:

```
AskUserQuestion({
  questions: [{
    question: "Are you sure you want to permanently delete this backlog item?",
    header: "Confirm Deletion",
    options: [
      { label: "Yes, delete it", description: "Permanently remove this item" },
      { label: "Cancel", description: "Keep the item" }
    ],
    multiSelect: false
  }]
})
```

3. If confirmed, delete the file
4. Confirm deletion to the user

## Important Notes

- Backlog items persist across sessions — they are not deleted when a workflow completes
- The `consumed` status is kept for historical reference; use `remove` to permanently delete
- Other workflow skills (brainstorming, investigate, plan, execute, team-loop) check for pending backlog items at session start and offer to create new items at session end
- When called from within another workflow, the `source` field is automatically set to the current subject
