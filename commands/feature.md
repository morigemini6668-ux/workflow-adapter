---
description: Integrated feature workflow (context -> brainstorming -> spec -> plan -> review)
argument-hint: <name> [description]
allowed-tools: [Read, Write, AskUserQuestion, Glob, Task, Teammate, SendMessage, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

Run the complete feature development workflow in one command.

## Arguments
- `$1`: Feature name (required, no spaces, use-kebab-case)
- Remaining arguments: Initial feature description

## Workflow Stages

This command runs all feature-* stages in sequence:
0. context-research (via Context Research skill)
1. feature-brainstorming
2. feature-spec
3. feature-plan
4. feature-review

## Tasks to Perform

### Stage 0: Context Research
Inform user: "Starting context research for feature: {name}"

**Create feature directory first:**
```bash
mkdir -p .workflow-adapter/doc/feature_$1
```

**Invoke the Context Research skill** with feature workflow integration:

1. Pass the feature name (`$1`) and initial description as the research topic
2. The skill dispatches expert teammates (codebase-analyst, web-researcher, + dynamic experts) in background
3. Simultaneously conducts interactive Q&A with the user to refine scope
4. Forwards accumulated user context to experts via broadcast after each Q&A round
5. Synthesizes expert findings + user Q&A into a unified context document

The skill saves the context to:
- `.workflow-adapter/doc/context/{feature_name}.md` (canonical location)
- `.workflow-adapter/doc/feature_$1/context.md` (feature workflow copy)

**After context research completes**, show transition message:
```
Context research complete. Proceeding to brainstorming phase...
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

**Draft Agent Guidance:**
For each worker agent with assigned tasks, draft customized guidance:
- Rules: Coding standards, constraints from spec
- Considerations: Edge cases, integration points, risks
- Exploration: Relevant code paths, documentation

**Interactive Guidance Refinement:**
For each agent, use `AskUserQuestion` to refine the guidance:
```yaml
question: "{AGENT_NAME}에게 할당된 task와 가이던스 초안입니다. 수정이 필요하신가요?"
header: "{AGENT_NAME}"
options:
  - label: "확인, 다음으로"
  - label: "규율 수정"
  - label: "주의사항 수정"
  - label: "탐색 영역 수정"
multiSelect: true
```

Apply user feedback before proceeding to next agent.

- Write to `.workflow-adapter/doc/feature_$1/plan.md` (including Agent Guidance section)

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

## Advocate Review (Automatic)

If the advocate agent is installed (check for `advocate.md` in agents directory), advocate review is automatically enabled at each stage:
- **Stage 1 (Brainstorming)**: After Q&A, advocate reviews brainstorming.md
- **Stage 2 (Spec)**: After generation, advocate reviews spec.md
- **Stage 3 (Plan)**: After generation, advocate reviews plan.md
- **Stage 4 (Review)**: Reviewer + advocate review in parallel

Each stage spawns its own team, receives advocate feedback, integrates it, and cleans up before proceeding to the next stage. This ensures each document benefits from critical review before being used as input for the next stage.

## Notes
- Stage 0 (context research) runs automatically before brainstorming, dispatching expert teammates
- Each stage builds on the previous
- User interaction is required in brainstorming stage
- Review may identify issues requiring revision
- Use individual commands (feature-brainstorming, feature-spec, etc.) for more control
- Context is saved in context.md and referenced throughout all stages
- Advocate review is automatic when advocate agent is installed (via `--advocate` flag on install)
