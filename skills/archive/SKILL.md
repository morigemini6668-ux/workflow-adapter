---
name: archive
description: Archive completed workflow subjects by extracting architectural decision records (ADRs) and cleaning up subject directories. Use this skill when the user mentions "archive", "아카이브", "정리", "cleanup", "ADR", "결정 기록", or wants to preserve decisions from past sessions while keeping .workflow-adapter/ lean.
argument-hint: "<subject name> | --all | --migrate"
---

# Archive Skill for Workflow Adapter

Archive completed workflow subjects by extracting key architectural decisions into ADR (Architecture Decision Record) files, then cleaning up subject directories. This preserves institutional knowledge while keeping the `.workflow-adapter/` directory lean.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Arguments

| Argument | Description |
|----------|-------------|
| `{subject}` | Archive a specific subject by name |
| `--all` | Archive all completed subjects in `.workflow-adapter/` |
| `--migrate` | Migration mode: scan and archive legacy subjects with batch confirmation |

If no argument is provided, use AskUserQuestion to ask the user which mode to use.

## ADR File Format

ADR files are stored in `.workflow-adapter/decisions/` with the naming convention `ADR-{NNN}.md`:

```markdown
---
id: ADR-{NNN}
title: {decision title}
status: accepted
date: {YYYY-MM-DD}
source: {subject name}
---
## Context
{Why this decision was needed — the problem or requirement that prompted it}

## Decision
{What was decided — the chosen approach or solution}

## Rationale
{Why this option was chosen over alternatives}

## Consequences
{Impact of this decision — trade-offs, follow-up work, constraints introduced}
```

## ADR Numbering

Auto-increment based on existing ADR files:
1. Glob `.workflow-adapter/decisions/ADR-*.md`
2. Find the highest existing number
3. New ADRs start from `highest + 1`
4. If no existing ADRs, start from `ADR-001`
5. Pad numbers to 3 digits (001, 002, ..., 999)

## Step 1: Identify Subjects to Archive

**Single subject mode** (`{subject}`):
1. Verify `.workflow-adapter/{subject}/` exists
2. If not found, list available subjects and ask the user to select one

**All mode** (`--all`):
1. Scan `.workflow-adapter/` for directories that contain `brainstorming.md` or `plan.md`
2. Exclude system directories: `backlog/`, `decisions/`, `principle.md`, `principle.*.md`
3. Present the list of found subjects to the user for confirmation

**Migration mode** (`--migrate`):
1. Scan all directories under `.workflow-adapter/`
2. Classify each:
   - Has `brainstorming.md`: full archive (extract ADRs from key conclusions/user decisions)
   - Has `plan.md` only: extract decisions from plan tasks and outcomes
   - Has neither: mark as "minimal" — create a placeholder ADR or skip
3. Present classification to the user via AskUserQuestion for batch confirmation

## Step 2: Extract Architectural Decisions

For each subject being archived, read its artifacts:

1. **Read `brainstorming.md`** (if exists):
   - Look for "Key Conclusions", "User Decisions", "Final Decision", "Chosen Approach" sections
   - Each distinct decision becomes a candidate ADR

2. **Read `plan.md`** (if exists):
   - Look for architectural choices in task descriptions
   - Look for technology selections, pattern choices, structural decisions

3. **Read `investigation.md`** (if exists):
   - Look for research conclusions that led to decisions

4. **Filter candidates**:
   - Only extract decisions that have lasting architectural significance
   - Skip implementation details, temporary choices, or trivial decisions
   - If no significant decisions are found, note this and ask the user if they want to create a summary ADR or skip

## Step 3: Draft ADR Files

For each candidate decision:
1. Draft the ADR content following the format above
2. Assign the next auto-incremented ADR number
3. Set the date to the current date
4. Set the source to the subject name

Present all drafted ADRs to the user for review before writing:

```
AskUserQuestion({
  questions: [{
    question: "I've extracted {N} architectural decisions from '{subject}'. Review the ADRs below and confirm which to create.\n\n{ADR summaries}",
    header: "ADR Review",
    options: [
      { label: "Create all", description: "Write all {N} ADR files" },
      { label: "Select individually", description: "Choose which ADRs to create" },
      { label: "Skip ADRs", description: "Don't create any ADRs, just clean up the subject" }
    ],
    multiSelect: false
  }]
})
```

If "Select individually" is chosen, present each ADR for individual approval.

## Step 4: Confirm Deletion

Before deleting any subject directory, get explicit user confirmation:

```
AskUserQuestion({
  questions: [{
    question: "The following subject directories will be deleted after archival:\n\n{list of directories}\n\nThis action is irreversible. Proceed?",
    header: "Confirm Deletion",
    options: [
      { label: "Delete all listed", description: "Remove all archived subject directories" },
      { label: "Keep directories", description: "Create ADRs but don't delete the subject directories" },
      { label: "Cancel", description: "Abort the entire operation" }
    ],
    multiSelect: false
  }]
})
```

## Step 5: Execute Archival

1. Create `.workflow-adapter/decisions/` directory if it doesn't exist
2. Write each approved ADR file with the correct numbering
3. If user confirmed deletion, remove the subject directories
4. If user chose "Keep directories", leave them in place

## Step 6: Summary

Present a summary of the archival:

```
Archive Summary:
- Subjects processed: {count}
- ADRs created: {list with IDs and titles}
- Directories removed: {list} (or "None — directories preserved")
- Skipped subjects: {list with reasons} (if any)
```

## Edge Cases

- **Empty subject directory**: Ask user whether to delete it or skip. No ADR needed.
- **Subject without brainstorming.md**: Try to extract decisions from plan.md or investigation.md. If nothing found, offer to create a minimal summary ADR or skip.
- **Duplicate decisions**: If a candidate ADR is very similar to an existing one in `.workflow-adapter/decisions/`, flag it and ask the user whether to skip, merge, or create as separate.
- **Large number of subjects** (migration mode): Process in batches of 5, confirming each batch with the user.

## Important Notes

- ADRs are permanent records — they should not be deleted once created
- Subject directories are deleted only after successful ADR creation and explicit user confirmation
- The `decisions/` directory is a first-class part of `.workflow-adapter/` — other skills should reference it when making architectural choices
- Migration mode is designed for one-time use when adopting this skill on an existing project
