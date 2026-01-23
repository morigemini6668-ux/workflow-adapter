---
description: Integrated fix workflow (triage -> plan -> review)
argument-hint: <name> [problem description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, Task]
---

Run the complete fix workflow in one command.

## Arguments
- `$1`: Fix name (required, no spaces, use-kebab-case)
- Remaining arguments: Initial problem description

## Workflow Stages

This command runs all fix-* stages in sequence:
1. fix-triage (interactive problem analysis)
2. fix-plan (implementation planning)
3. fix-review (validation)

## Tasks to Perform

### Stage 0: Context Gathering
Inform user: "Gathering project context for fix: {name}"

**Create fix directory first:**
```bash
mkdir -p .workflow-adapter/doc/fix_$1
```

**Gather the following context:**

1. **Project Documentation**
   - Read `AGENT.md` if exists
   - Read `CLAUDE.md` if exists
   - Read `.claude/settings.json` if exists

2. **Previous Fixes**
   - Use Glob to find: `.workflow-adapter/doc/fix_*/triage.md`
   - Read each triage.md to understand previous fixes
   - Skip the current fix directory if it exists

3. **User Input**
   - Fix name from $1
   - Problem description from remaining arguments

**Write context summary to `.workflow-adapter/doc/fix_$1/context.md`**

**Show summary to user:**
```
Project Context Gathered

Project docs found: AGENT.md {check/x}, CLAUDE.md {check/x}
Previous fixes found: {count}

Potentially related fixes:
- {fix_name}: {brief issue}

Proceeding to triage phase...
```

### Stage 1: Triage
Inform user: "Starting triage phase for fix: {name}"

**Read context first:**
@.workflow-adapter/doc/fix_$1/context.md

Run interactive triage session:
- Clarify the problem type and symptoms
- Analyze code to find root cause
- Assess impact scope
- Propose solutions
- Evaluate risks
- Document in `.workflow-adapter/doc/fix_$1/triage.md`

### Stage 2: Planning
Inform user: "Creating implementation plan..."

**Read context and triage:**
@.workflow-adapter/doc/fix_$1/context.md
@.workflow-adapter/doc/fix_$1/triage.md

Generate implementation plan:
- Create tasks based on triage findings
- Apply risk mitigations
- Assign to available agents
- Include agent guidance
- Write to `.workflow-adapter/doc/fix_$1/plan.md`

### Stage 3: Review
Inform user: "Running review..."

Launch reviewer agent to validate:
- Root cause accuracy
- Solution appropriateness
- Risk coverage
- Plan completeness

### Final Output
```
Fix Development Complete: {fix_name}

Documents created:
- .workflow-adapter/doc/fix_{name}/context.md
- .workflow-adapter/doc/fix_{name}/triage.md
- .workflow-adapter/doc/fix_{name}/plan.md

Triage Summary:
- Issue Type: {type}
- Severity: {severity}
- Root Cause: {brief}

Review Status: {APPROVED / NEEDS_REVISION}

{If APPROVED}
Ready for execution!
Next step: Run /workflow-adapter:execute {name} --fix to start agent execution.

{If NEEDS_REVISION}
Please address the following before executing:
{list of issues}

Next steps:
- Revise triage: /workflow-adapter:fix-triage {name}
- Revise plan: /workflow-adapter:fix-plan {name} --revise
```

## Notes
- Stage 0 (context gathering) runs automatically
- Stage 1 (triage) requires user interaction for problem clarification
- Each stage builds on the previous
- Review may identify issues requiring revision
- Use individual commands (fix-triage, fix-plan, fix-review) for more control
- For simple fixes, you might skip directly to execute after triage
