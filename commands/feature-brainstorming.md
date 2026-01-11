---
description: Interactive brainstorming to refine a feature
argument-hint: <name> [description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, WebSearch, WebFetch]
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
📋 Project Context Gathered

Project docs: AGENT.md {✓/✗}, CLAUDE.md {✓/✗}
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
🔍 Web Research Complete

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

### 7. Output Summary
Confirm brainstorming is saved and suggest next step:
```
Brainstorming for '{feature_name}' saved to:
.workflow-adapter/doc/feature_{name}/brainstorming.md

Documents created:
- context.md (project context)
- brainstorming.md (this session)

Next step: Run /workflow-adapter:feature-spec {name} to generate the specification.
```
