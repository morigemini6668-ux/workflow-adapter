---
description: Integrated feature workflow (context -> brainstorming -> spec -> plan -> review)
argument-hint: <name> [description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, Task]
---

Run the complete feature development workflow in one command.

## Arguments
- `$1`: Feature name (required, no spaces, use-kebab-case)
- Remaining arguments: Initial feature description

## Workflow Stages

This command runs all feature-* stages in sequence:
0. context-gathering (NEW)
1. feature-brainstorming
2. feature-spec
3. feature-plan
4. feature-review

## Tasks to Perform

### Stage 0: Context Gathering
Inform user: "Gathering project context for feature: {name}"

**Create feature directory first:**
```bash
mkdir -p .workflow-adapter/doc/feature_$1
```

**Gather the following context:**

1. **Project Documentation**
   - Read `AGENT.md` if exists (project agent instructions)
   - Read `CLAUDE.md` if exists (project-specific Claude instructions)
   - Read `.claude/settings.json` if exists (project settings)

2. **Existing Features**
   - Use Glob to find: `.workflow-adapter/doc/feature_*/spec.md`
   - Read each spec.md to understand implemented features
   - Skip the current feature directory if it exists

3. **User Input**
   - Feature name from $1
   - Initial description from remaining arguments

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
- **Status**: {if available}

## Context Summary
Based on the gathered context:
- Total existing features: {count}
- Related features: {list features that might be related}
- Project conventions: {any patterns noticed}

---
_Context gathered: {timestamp}_
```

**Show summary to user:**
```
📋 Project Context Gathered

Project docs found: AGENT.md ✓/✗, CLAUDE.md ✓/✗
Existing features found: {count}
{list feature names}

Related features that might affect this implementation:
- {feature_name}: {brief description}

Proceeding to brainstorming phase...
```

### Stage 1: Brainstorming
Inform user: "Starting brainstorming phase for feature: {name}"

**Read context first:**
@.workflow-adapter/doc/feature_$1/context.md

Run interactive brainstorming session:
- Consider existing features and project context
- Ask about problem, requirements, users, technical considerations
- Document in `.workflow-adapter/doc/feature_$1/brainstorming.md`

### Stage 2: Specification
Inform user: "Generating specification..."

**Read context and brainstorming:**
@.workflow-adapter/doc/feature_$1/context.md
@.workflow-adapter/doc/feature_$1/brainstorming.md

Generate spec from brainstorming:
- Consider project context and existing features
- Create structured specification document
- Write to `.workflow-adapter/doc/feature_$1/spec.md`

### Stage 3: Planning
Inform user: "Creating implementation plan..."

**Read all previous documents:**
@.workflow-adapter/doc/feature_$1/context.md
@.workflow-adapter/doc/feature_$1/spec.md

Generate implementation plan:
- Consider existing features to avoid conflicts
- Break down into tasks
- Assign to available agents
- Write to `.workflow-adapter/doc/feature_$1/plan.md`

### Stage 4: Review
Inform user: "Running review..."

Launch reviewer agent to validate all documents:
- Check completeness
- Check consistency
- Check feasibility

### Final Output
```
Feature Development Complete: {feature_name}

Documents created:
- .workflow-adapter/doc/feature_{name}/context.md
- .workflow-adapter/doc/feature_{name}/brainstorming.md
- .workflow-adapter/doc/feature_{name}/spec.md
- .workflow-adapter/doc/feature_{name}/plan.md

Review Status: {APPROVED / NEEDS_REVISION}

{If APPROVED}
Ready for execution!
Next step: Run /workflow-adapter:execute to start agent execution.

{If NEEDS_REVISION}
Please address the following before executing:
{list of issues}
```

## Notes
- Stage 0 (context gathering) runs automatically before brainstorming
- Each stage builds on the previous
- User interaction is required in brainstorming stage
- Review may identify issues requiring revision
- Use individual commands (feature-brainstorming, feature-spec, etc.) for more control
- Context is saved in context.md and referenced throughout all stages
