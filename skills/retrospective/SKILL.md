---
name: retrospective
description: This skill should be used when the user asks to "retrospective", "retro", "회고", "세션 회고", "principle auto-detect", "원칙 자동 감지", "원칙 추출", "extract principles", "learn from session", "세션에서 배우기", or wants to analyze a completed workflow session to extract conventions, patterns, and lessons learned, then suggest updates to principle.md. Inspired by REAP's genome-sync concept.
---

# Retrospective — Principle Auto-Detection for Workflow Adapter

Analyze a completed workflow session to extract conventions, patterns, and decisions, then suggest updates to `.workflow-adapter/principle.md`. This skill helps codify lessons learned so future sessions benefit from past experience.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 1: Identify the Subject

If a subject was provided as an argument, use it. Otherwise:

1. Check `.workflow-adapter/` for existing subject folders that contain completed artifacts (`brainstorming.md`, `investigation.md`, or `plan.md` with completed tasks)
2. If multiple subjects exist, use AskUserQuestion to ask which one to retrospect:

```
AskUserQuestion({
  questions: [{
    question: "Which subject would you like to run a retrospective on?",
    header: "Subject",
    options: [
      // dynamically generated from available subjects
      { label: "{subject-1}", description: "Contains: brainstorming.md, plan.md" },
      { label: "{subject-2}", description: "Contains: investigation.md" }
    ],
    multiSelect: false
  }]
})
```

3. If no completed subjects exist, inform the user: "No completed workflow sessions found. Run a brainstorming, investigation, or execution workflow first, then run a retrospective."

## Step 2: Gather Session Artifacts

Read all available artifacts from `.workflow-adapter/{subject}/`:

1. **brainstorming.md** — Decisions made, alternatives considered, points of agreement/contention
2. **investigation.md** — Root causes identified, solutions proposed, risk assessments
3. **plan.md** — Task structure, completion criteria, verification methods, any "Changes" notes
4. **team-loop-target.md** — Problem definition, iteration history, verification method
5. **doc/** — Research documents, historian context, analysis files
6. **iter-*-plan.md** — Per-iteration plans (if team-loop session)
7. **iter-*-execution*.md** — Execution summaries (if team-loop session)

If no artifacts are found, inform the user and stop.

## Step 3: Analyze Git Changes

If the subject had code changes (check for a branch matching the subject name or recent commits referencing it):

```bash
# Check for a branch with the subject name
git branch --list "*{subject}*"

# If found, get the diff against the base branch
git log --oneline {subject-branch}..HEAD 2>/dev/null || true
git diff main...{subject-branch} --stat 2>/dev/null || true
```

Analyze the code changes for:
- **Coding patterns**: Consistent naming conventions, error handling patterns, testing approaches
- **Architecture decisions**: New modules, dependency choices, API design patterns
- **Tool usage**: Libraries chosen, configuration patterns, build tool conventions

If no code changes are found, skip this step and rely solely on session artifacts.

## Step 4: Extract Candidate Principles

From the gathered artifacts and code changes, identify candidate principles in these categories:

### 4a. Explicit Decisions
Extract from brainstorming.md "User Decisions" and "Key Conclusions" sections, or investigation.md "Recommended Action" section:
- Technology choices (e.g., "Use Zod for runtime validation")
- Architecture patterns (e.g., "Separate read/write models for data access")
- Process rules (e.g., "All API changes require backward compatibility")

### 4b. Implicit Conventions
Detect from code changes and session patterns:
- Naming conventions consistently applied
- Error handling patterns repeated across files
- Testing strategies used
- File organization patterns

### 4c. Lessons Learned
Extract from iteration history (team-loop) or reviewer feedback:
- Approaches that failed and why (anti-patterns to avoid)
- Approaches that succeeded unexpectedly
- Recurring issues that required multiple attempts

### 4d. Process Improvements
Extract from the workflow itself:
- Steps that were skipped or added ad-hoc
- Communication patterns that worked or didn't
- Verification methods that caught (or missed) issues

## Step 5: Compare with Existing Principles

1. Read `.workflow-adapter/principle.md` if it exists
2. Read all `.workflow-adapter/principle.*.md` files if they exist
3. For each candidate principle, determine:
   - **New**: Not covered by any existing principle
   - **Reinforcement**: Aligns with an existing principle (no change needed, but note it)
   - **Conflict**: Contradicts an existing principle (needs resolution)
   - **Refinement**: Extends or adds specificity to an existing principle

Filter out reinforcements (no action needed) and focus on new, conflicting, and refinement candidates.

## Step 6: Present Suggestions to User

For each candidate principle (grouped by category), present it to the user for confirmation:

```
AskUserQuestion({
  questions: [{
    question: "Based on the retrospective analysis, I found the following potential principle:\n\n**Category**: {Coding Standard / Process Rule / Architecture Pattern / etc.}\n**Type**: {New / Conflict / Refinement}\n**Principle**: {clear, actionable statement}\n**Evidence**: {where this was observed — specific artifact or code change}\n{If conflict: **Conflicts with**: {existing principle text}}\n\nWould you like to add this to principle.md?",
    header: "Principle Suggestion",
    options: [
      { label: "Accept", description: "Add this principle to principle.md" },
      { label: "Modify", description: "Accept with changes — I'll edit the wording" },
      { label: "Skip", description: "Don't add this principle" },
      { label: "Agent-specific", description: "Add this to a specific agent's principle file instead of the global one" }
    ],
    multiSelect: false
  }]
})
```

If the user selects **"Modify"**: ask for their revised wording, then confirm.

If the user selects **"Agent-specific"**: ask which agent(s) should follow this principle:
```
AskUserQuestion({
  questions: [{
    question: "Which agent(s) should follow this principle?",
    header: "Agent Scope",
    options: [
      { label: "orchestrator", description: "Team leader that coordinates all workflows" },
      { label: "executer", description: "Worker that implements tasks from plan.md" },
      { label: "researcher", description: "Researches topics via codebase, web, and docs" },
      { label: "reviewer", description: "Devil's Advocate that reviews all outputs" },
      { label: "historian", description: "Explores past context via git history" },
      { label: "enricher", description: "Adds telemetry instrumentation" }
    ],
    multiSelect: true
  }]
})
```

## Step 7: Apply Approved Changes

For each accepted principle:

1. **If principle.md does not exist**: Create `.workflow-adapter/principle.md` with the standard structure:
   ```markdown
   # Principles

   ## {Category}

   ### {Principle Title}
   - **Rule**: {Clear, actionable statement}
   - **Rationale**: {Why this principle exists}
   - **Source**: Retrospective on {subject} ({date})
   ```

2. **If principle.md exists**:
   - For **new** principles: Append under the appropriate category section (create the section if it doesn't exist)
   - For **conflict** resolutions: Replace the conflicting principle with the user's chosen version
   - For **refinements**: Update the existing principle text with the refined version

3. **For agent-specific principles**: Write to `.workflow-adapter/principle.{agent_name}.md` using the same format

After each write, confirm to the user what was changed and in which file.

## Step 8: Summary

Present a final summary to the user:

```
## Retrospective Summary: {subject}

### Artifacts Analyzed
- {list of files read}

### Code Changes Analyzed
- {branch/commits examined, or "None"}

### Principles Extracted
| # | Category | Principle | Action | File |
|---|----------|-----------|--------|------|
| 1 | Coding Standard | Use Zod for validation | Added | principle.md |
| 2 | Process Rule | Require API backward compat | Modified & Added | principle.md |
| 3 | Architecture | Separate read/write models | Skipped | — |
| 4 | Tool Usage | Prefer Context7 for docs | Added | principle.researcher.md |

### Skipped Suggestions
- {list of skipped candidates with brief reason if the user provided one}

### Reinforced Existing Principles
- {list of existing principles that were confirmed by this session's patterns}
```

## Handling Edge Cases

- **No new conventions detected**: Inform the user — "The retrospective analysis didn't identify any new conventions or patterns beyond what's already in principle.md. This session aligned well with existing principles."
- **principle.md doesn't exist and no candidates found**: Inform the user and suggest running a workflow session first.
- **Subject has no completed work**: Inform the user — "This subject doesn't appear to have completed work to retrospect on. Run the workflow to completion first."
- **Multiple subjects**: The user can run retrospective on each subject individually, or provide `--all` to analyze all completed subjects in sequence.
