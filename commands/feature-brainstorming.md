---
description: Interactive brainstorming to refine a feature
argument-hint: <name> [description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, WebSearch, WebFetch, Grep, Bash, Task, TodoWrite, Skill, Teammate, SendMessage, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

Start an interactive brainstorming session to refine a feature.

## Arguments
- `$1`: Feature name (required, no spaces, use-kebab-case)
- Remaining arguments: Initial feature description

## Tasks to Perform

### 1. Validate Arguments
Ensure feature name is provided. If not, ask the user for it.

### 2. Create Feature Directory
```bash
mkdir -p .workflow-adapter/doc/feature_$1
```

### 3. Gather Project Context (IMPORTANT - Do this before brainstorming!)

**Read project documentation:**
- Check if `AGENT.md` exists and read it
- Check if `CLAUDE.md` exists and read it
- Check if `.claude/settings.json` exists and read it

**Find existing features:**
- Use Glob to find: `.workflow-adapter/doc/feature_*/spec.md`
- Read each spec.md to understand what features are already implemented
- Skip the current feature directory if it already exists

**Write context summary to `.workflow-adapter/doc/feature_$1/context.md`:**

```markdown
---
version: "{CURRENT_TIMESTAMP_ISO8601}"
depends_on: {}
---

# Feature Context: {feature_name}

## User Request
- **Feature Name**: {name}
- **Initial Description**: {description from arguments}

## Project Documentation

### AGENT.md
{Content summary or "Not found"}

### CLAUDE.md
{Content summary or "Not found"}

## Existing Features
{For each existing feature:}
### feature_{name}
- **Purpose**: {from spec overview}
- **Key Requirements**: {summarized}

## Context Summary
- Total existing features: {count}
- Related features: {list any that seem related to this new feature}

---
_Context gathered: {timestamp}_
```

**Show summary to user:**
```
Project Context Gathered

Project docs: AGENT.md {check/cross}, CLAUDE.md {check/cross}
Existing features: {count} found
{list feature names briefly}

Now researching best practices and similar solutions...
```

### 4. Web Research (Optional but Recommended)
Use WebSearch to gather relevant information about the feature:

**Search queries to consider:**
- "{feature description} best practices"
- "{feature description} implementation patterns"
- "{technology stack} {feature type} examples"
- "how to implement {feature} in {language/framework}"

**For each relevant search result:**
- Use WebFetch to get detailed information if needed
- Extract key insights, patterns, and recommendations

**Add research findings to context.md:**

```markdown
## Web Research

### Best Practices Found
- {practice 1 with source}
- {practice 2 with source}

### Similar Solutions
- {solution 1}: {brief description}
- {solution 2}: {brief description}

### Key Insights
- {insight 1}
- {insight 2}

### Recommended Approaches
- {approach based on research}

_Research conducted: {timestamp}_
```

**Show research summary to user:**
```
Web Research Complete

Found insights on:
- Best practices: {count} items
- Similar solutions: {count} references
- Key recommendations: {list briefly}

Now starting interactive brainstorming with this research in mind...
```

### 5. Start Interactive Brainstorming
Use AskUserQuestion to gather information. Ask questions one at a time or in small groups.

**Reference the context when asking questions** - tailor questions based on:
- What's already implemented (avoid duplication)
- Project conventions from AGENT.md/CLAUDE.md
- Potential integration points with existing features

**Questions to explore:**

1. **Problem Space**
   - What problem does this feature solve?
   - Who are the target users?
   - What happens if this feature doesn't exist?

2. **Requirements**
   - What are the must-have requirements?
   - What are nice-to-have requirements?
   - Are there any constraints or limitations?

3. **User Experience**
   - How will users interact with this feature?
   - What is the expected workflow?
   - Any edge cases to consider?

4. **Technical Considerations**
   - What existing code/components will this affect?
   - How does this relate to existing features? (reference context.md)
   - Are there any dependencies?
   - Performance requirements?

5. **Success Criteria**
   - How do we know when this feature is complete?
   - How do we measure success?
   - What are the acceptance criteria?

6. **Research Validation** (if web research was done)
   - Do the found best practices apply to our case?
   - Should we adopt any of the similar solutions?
   - Any concerns about the recommended approaches?

### 6. Document Brainstorming
Write the brainstorming results to `.workflow-adapter/doc/feature_$1/brainstorming.md`:

```markdown
---
version: "{CURRENT_TIMESTAMP_ISO8601}"
depends_on:
  context.md: "{VERSION_FROM_CONTEXT_MD}"
---

# Feature Brainstorming: {feature_name}

## Overview
{Initial description from arguments}

## Problem Statement
{What problem this solves}

## Target Users
{Who will use this feature}

## Requirements

### Must-Have
- {requirement 1}
- {requirement 2}

### Nice-to-Have
- {requirement 1}

## User Experience
{How users will interact}

## Technical Considerations
- Dependencies: {list}
- Affected components: {list}
- Constraints: {list}

## Success Criteria
- {criterion 1}
- {criterion 2}

## Research Insights Applied
{If web research was done:}
- Best practices adopted: {list}
- Similar solutions referenced: {list}
- Approaches chosen based on research: {list}

## Open Questions
- {Any unresolved questions}

## Notes
{Additional notes from discussion}

---
_Brainstorming session completed: {timestamp}_
```

### 6.5. Advocate Review (Automatic)

**Only execute this step if the advocate agent is installed.**

Check if the advocate agent is installed:
- Use Glob to check if `{AGENTS_DIR}/advocate.md` exists (check both `.claude/agents/.local/workflow-adapter/` and `.claude/agents/workflow-adapter/`)
- If advocate is NOT installed, skip this step silently
- If advocate IS installed, proceed:

#### 6.5.1 Spawn Team
```
Teammate.spawnTeam("wa-brainstorm-{name}", "Brainstorming review: {name}")
```

#### 6.5.2 Create Review Task
Use `TaskCreate` to create a review task:
- subject: "Review brainstorming.md for feature: {name}"
- description: "Critically review the brainstorming document. Challenge assumptions, find gaps, identify risks."

#### 6.5.3 Spawn Advocate
Use `Task` tool to spawn advocate as a teammate:
```yaml
team_name: "wa-brainstorm-{name}"
name: "advocate"
subagent_type: "workflow-adapter:advocate"
mode: "bypassPermissions"
prompt: |
  You are the Devil's Advocate reviewing brainstorming results.

  ## Feature: {feature_name}

  ## Document to Review
  Read and critically review: .workflow-adapter/doc/feature_{name}/brainstorming.md
  Also read context: .workflow-adapter/doc/feature_{name}/context.md

  ## Your Task
  1. Read the brainstorming document
  2. Challenge every assumption made
  3. Identify missing failure scenarios and edge cases
  4. Question the problem statement and proposed approach
  5. Suggest alternative perspectives

  Send your feedback to the team lead via SendMessage when done.
  Mark your task as completed via TaskUpdate.
```

#### 6.5.4 Assign Task
Use `TaskUpdate` to assign the review task to "advocate".

#### 6.5.5 Receive Feedback
Wait for advocate's feedback message.

#### 6.5.6 Integrate Feedback
Add a "Devil's Advocate Feedback" section to brainstorming.md:
```markdown
## Devil's Advocate Feedback

### Assumptions Challenged
{from advocate feedback}

### Risks Identified
{from advocate feedback}

### Missing Considerations
{from advocate feedback}

### Recommendations
{from advocate feedback}

---
_Advocate review completed: {timestamp}_
```

#### 6.5.7 Cleanup Team
Send `shutdown_request` to advocate, then call `Teammate.cleanup()`.

### 7. Output Summary
Confirm brainstorming is saved and suggest next step:
```
Brainstorming for '{feature_name}' saved to:
.workflow-adapter/doc/feature_{name}/brainstorming.md

Documents created:
- context.md (project context)
- brainstorming.md (this session)
{If advocate installed: - Includes Devil's Advocate feedback section}

Next step: Run /workflow-adapter:feature-spec {name} to generate the specification.
```
