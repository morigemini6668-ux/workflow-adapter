---
name: principle
description: This skill should be used when the user asks to "add a principle", "add principle", "update principle", "remove principle", "show principles", "set agent rules", "principle 추가", "원칙 추가", "원칙 수정", "원칙 삭제", "원칙 보여줘", "규칙 추가", "가이드라인 추가", "에이전트 규칙 설정", "코딩 규칙 추가", or wants to define, update, view, or remove behavioral guidelines (.workflow-adapter/principle.md) that agents follow during workflow execution.
---

# Principle Management for Workflow Adapter

Create and manage principle files that govern agent behavior across all workflow-adapter workflows. Principle files are already referenced by every agent (orchestrator, executer, researcher, historian, reviewer, enricher) — use this workflow to create, update, view, or remove them.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Principle File Types

| File | Scope | Priority |
|------|-------|----------|
| `.workflow-adapter/principle.md` | All agents | Base rules |
| `.workflow-adapter/principle.{agent_name}.md` | Specific agent only | Overrides base on conflict |

Valid agent names: `orchestrator`, `executer`, `researcher`, `historian`, `reviewer`, `enricher`

## Step 1: Understand the Principle

Use AskUserQuestion to clarify the user's intent:

```
AskUserQuestion({
  questions: [{
    question: "What principle or guideline do you want to add? Describe the rule, behavior, or constraint that agents should follow.",
    header: "Principle",
    options: [
      { label: "Coding standard", description: "Code style, naming conventions, testing requirements, etc." },
      { label: "Process rule", description: "Workflow behavior, approval gates, communication rules, etc." },
      { label: "Domain constraint", description: "Business logic, security rules, architecture patterns, etc." },
      { label: "Tool restriction", description: "Limit or require specific tools, MCP servers, or approaches." }
    ],
    multiSelect: false
  }]
})
```

Then follow up to get specific content if the user's initial description is vague.

## Step 2: Determine Scope

Use AskUserQuestion to determine which agents the principle applies to:

```
AskUserQuestion({
  questions: [{
    question: "Which agents should follow this principle?",
    header: "Scope",
    options: [
      { label: "All agents (Recommended)", description: "Write to principle.md — applies to every agent in every workflow." },
      { label: "Specific agent(s)", description: "Write to principle.{agent}.md — applies only to selected agent(s)." }
    ],
    multiSelect: false
  }]
})
```

If the user selects "Specific agent(s)", ask which agents:

```
AskUserQuestion({
  questions: [{
    question: "Select the target agent(s):",
    header: "Agent",
    options: [
      { label: "orchestrator", description: "Team leader that coordinates all workflows" },
      { label: "executer", description: "Worker that implements tasks from plan.md" },
      { label: "researcher", description: "Researches topics via codebase, web, and docs" },
      { label: "reviewer", description: "Devil's Advocate that reviews all outputs" },
      { label: "historian", description: "Explores past context via git history, project docs, and issue trackers" },
      { label: "enricher", description: "Adds telemetry instrumentation during investigations" }
    ],
    multiSelect: true
  }]
})
```

## Step 3: Check Existing Principles

Before writing, check if principle files already exist:

1. Read `.workflow-adapter/principle.md` if it exists
2. Read `.workflow-adapter/principle.{agent_name}.md` for targeted agents if they exist

If existing files are found, present the current content to the user and ask whether to:
- **Append**: Add the new principle to the existing file
- **Replace**: Overwrite the existing content entirely
- **Merge**: Integrate the new principle while keeping existing ones

## Step 4: Draft the Principle

Draft the principle content in markdown format. Follow this structure:

```markdown
# Principles

## {Principle Category}

### {Principle Title}
- **Rule**: {Clear, actionable statement}
- **Rationale**: {Why this principle exists}
- **Examples**: {Concrete examples of correct/incorrect behavior}
```

**Writing guidelines:**
- Write in imperative form ("Use TypeScript strict mode", not "You should use...")
- Be specific and actionable — avoid vague directives
- Include concrete examples where possible
- If the principle conflicts with default agent behavior, explicitly state the override

Present the draft to the user for confirmation before writing.

## Step 5: Write the File

Ensure `.workflow-adapter/` directory exists, then write the principle file:

- For all-agent scope: `.workflow-adapter/principle.md`
- For agent-specific scope: `.workflow-adapter/principle.{agent_name}.md`

After writing, confirm to the user which file(s) were created and summarize the principles added.

## Viewing Principles

If the user asks to view or list current principles:

1. Check for `.workflow-adapter/principle.md` and all `.workflow-adapter/principle.*.md` files
2. Read and present each file's contents with clear labels
3. If no principle files exist, inform the user and offer to create one

## Removing a Principle

If the user asks to remove a principle:

1. Read the target principle file
2. Present the current principles and ask which to remove via AskUserQuestion
3. Rewrite the file without the removed principle
4. If no principles remain in the file, delete the file entirely
5. Confirm the removal to the user

## Common Principle Examples

### Coding Standard
```markdown
# Principles

## Code Quality
### TypeScript Strict Mode
- **Rule**: Always use TypeScript strict mode. Never use `any` type.
- **Rationale**: Type safety prevents runtime errors.
- **Example**: Use `unknown` instead of `any`, then narrow with type guards.
```

### Process Rule (Orchestrator-specific)
```markdown
# Orchestrator Principles

## Communication
### Korean Output
- **Rule**: All user-facing output and brainstorming.md content must be in Korean.
- **Rationale**: The project team communicates in Korean.
```

### Tool Restriction (Researcher-specific)
```markdown
# Researcher Principles

## Tool Usage
### Prefer Context7 for Library Docs
- **Rule**: Always use Context7 (resolve-library-id + query-docs) before web search for library documentation.
- **Rationale**: Context7 provides more accurate, version-specific documentation.
```

## Important Notes

- Principle files take effect immediately — all agents check for them at startup
- Agent-specific principles override general principles on conflict
- Keep principles concise; overly long principle files consume agent context
- Principles persist across sessions until manually edited or removed
