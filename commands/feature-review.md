---
description: Review feature documents using reviewer agent
argument-hint: <name> [--in-session]
allowed-tools: [Read, Task, Teammate, SendMessage, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

Review all feature documents using the reviewer agent.

## Arguments
- `$1`: Feature name (required)
- `--in-session`: Use in-session mode (reviewer as subagent only, no teammate coordination)

## Tasks to Perform

### 1. Validate Prerequisites and Check Versions

**Step 1.1: Check prerequisites exist**
Check that these files exist:
- `.workflow-adapter/doc/feature_$1/context.md` (project context)
- `.workflow-adapter/doc/feature_$1/brainstorming.md`
- `.workflow-adapter/doc/feature_$1/spec.md`
- `.workflow-adapter/doc/feature_$1/plan.md`

If any are missing, inform user which steps to run first.

**Step 1.2: Check version dependencies**

If `.workflow-adapter/doc/feature_$1/review.md` already exists:

1. Read review.md and extract YAML frontmatter `depends_on` section
2. For each dependency (context.md, brainstorming.md, spec.md, plan.md):
   - Read the dependency file's frontmatter `version` field
   - Compare with the version recorded in review.md's `depends_on`

3. If any dependency's current version differs from recorded version (or if review.md has no frontmatter/depends_on):

   Show warning to user:
   ```
   review.md was generated based on older versions of prerequisites.

   Version changes detected:
   - {filename}: recorded {old_version} -> current {new_version}
   ```

   Use AskUserQuestion to let user decide:
   ```yaml
   question: "review.md의 선행 문서가 업데이트되었습니다. 어떻게 진행할까요?"
   header: "버전 충돌"
   options:
     - label: "재생성 (권장)"
       description: "최신 선행 문서 기반으로 review.md 새로 생성"
     - label: "기존 유지"
       description: "현재 review.md 유지 (선행 문서와 불일치할 수 있음)"
     - label: "취소"
       description: "작업 중단"
   ```

   - If "재생성": Continue with review generation (Step 2)
   - If "기존 유지": Skip review generation, proceed to summary
   - If "취소": Stop execution

4. If review.md doesn't exist OR user chose "재생성":
   Proceed to Step 2 (Gather Feature Documents)

### 2. Gather Feature Documents
Read all feature documents:
- Context: @.workflow-adapter/doc/feature_$1/context.md
- Brainstorming: @.workflow-adapter/doc/feature_$1/brainstorming.md
- Specification: @.workflow-adapter/doc/feature_$1/spec.md
- Plan: @.workflow-adapter/doc/feature_$1/plan.md

### 3. Launch Review

Check if `--in-session` flag is present. If present, use **In-Session Mode (3A)**. Otherwise, use **Default Teammate Mode (3B)**.

---

#### 3A. In-Session Mode (--in-session)

Use the Task tool to launch the reviewer as a subagent with this prompt:

```
You are the Reviewer agent. Review the following feature documents for completeness and quality.

Feature: {feature_name}

## Documents to Review

### Project Context
{context content - existing features, project docs}

### Brainstorming Document
{brainstorming content}

### Specification Document
{spec content}

### Implementation Plan
{plan content}

## Review Criteria

1. **Completeness**
   - Are all requirements from brainstorming captured in spec?
   - Are all spec requirements covered in the plan?
   - Are acceptance criteria clear and measurable?

2. **Consistency**
   - Do documents align with each other?
   - Are there any contradictions?
   - Is terminology consistent?

3. **Context Alignment**
   - Does the feature properly integrate with existing features? (from context.md)
   - Are project conventions followed? (from AGENT.md/CLAUDE.md in context)
   - Are potential conflicts with existing features addressed?

4. **Feasibility**
   - Is the plan realistic?
   - Are task assignments balanced?
   - Are dependencies properly identified?

5. **Quality**
   - Is the specification detailed enough?
   - Are edge cases covered?
   - Are risks identified?

## Output Required
Provide a structured review with:
- Overall assessment (APPROVED / NEEDS_REVISION)
- Issues found (by category)
- Specific recommendations
- Questions for the user
```

---

#### 3B. Default Teammate Mode

##### 3B.1 Spawn Team
```
Teammate.spawnTeam("wa-review-{name}", "Feature review: {name}")
```

##### 3B.2 Create Review Tasks
Use `TaskCreate` to create tasks:

**Task 1 - Reviewer:**
- subject: "Review feature documents: {name}"
- description: "Review all feature documents for completeness, consistency, feasibility, and quality. Provide structured review with APPROVED/NEEDS_REVISION verdict."

**Task 2 - Advocate (if installed):**
Check if advocate agent is installed (check for `advocate.md` in agents directory). If installed, create:
- subject: "Critical review of feature: {name}"
- description: "Devil's advocate review: challenge assumptions, find weaknesses, identify missing failure scenarios, security/performance concerns."

##### 3B.3 Spawn Reviewer Teammate
Use `Task` tool:
```yaml
team_name: "wa-review-{name}"
name: "reviewer"
subagent_type: "workflow-adapter:reviewer"
mode: "bypassPermissions"
prompt: |
  You are the Reviewer agent performing a teammate-based review.

  ## Feature: {feature_name}

  ## Documents to Review
  - Context: .workflow-adapter/doc/feature_{name}/context.md
  - Brainstorming: .workflow-adapter/doc/feature_{name}/brainstorming.md
  - Specification: .workflow-adapter/doc/feature_{name}/spec.md
  - Plan: .workflow-adapter/doc/feature_{name}/plan.md

  ## Review Criteria
  1. Completeness - all requirements captured?
  2. Consistency - documents align?
  3. Context Alignment - integrates with existing features?
  4. Feasibility - plan realistic?
  5. Quality - enough detail, edge cases covered?

  Send your review to the team lead via SendMessage when done.
  Mark your task as completed via TaskUpdate.
```

##### 3B.4 Spawn Advocate Teammate (if installed)
Check if advocate.md exists in agents directory. If installed, use `Task` tool:
```yaml
team_name: "wa-review-{name}"
name: "advocate"
subagent_type: "workflow-adapter:advocate"
mode: "bypassPermissions"
prompt: |
  You are the Devil's Advocate performing a critical review alongside the reviewer.

  ## Feature: {feature_name}

  ## Documents to Review
  - Context: .workflow-adapter/doc/feature_{name}/context.md
  - Brainstorming: .workflow-adapter/doc/feature_{name}/brainstorming.md
  - Specification: .workflow-adapter/doc/feature_{name}/spec.md
  - Plan: .workflow-adapter/doc/feature_{name}/plan.md

  ## Your Focus (different from reviewer)
  1. Challenge assumptions in the spec and plan
  2. Identify missing failure scenarios
  3. Security and performance concerns
  4. Hidden complexity and maintenance risks
  5. What could go wrong during implementation?

  Send your critical review to the team lead via SendMessage when done.
  Mark your task as completed via TaskUpdate.
```

##### 3B.5 Assign Tasks
Assign Task 1 to "reviewer" and Task 2 to "advocate" (if spawned) via `TaskUpdate`.

**IMPORTANT:** Spawn reviewer and advocate in parallel (both Task calls in a single message) for maximum efficiency.

##### 3B.6 Receive and Integrate Feedback
Wait for messages from both agents. Integrate into review.md with separate sections:

```markdown
## Reviewer Findings
{reviewer's structured review}

## Devil's Advocate Findings
{advocate's critical review - only if advocate was spawned}
```

##### 3B.7 Cleanup Team
Send `shutdown_request` to all teammates, then call `Teammate.cleanup()`.

### 4. Save Review Results
Write the review feedback to `.workflow-adapter/doc/feature_$1/review.md`:

```markdown
---
version: "{CURRENT_TIMESTAMP_ISO8601}"
depends_on:
  context.md: "{VERSION_FROM_CONTEXT_MD}"
  brainstorming.md: "{VERSION_FROM_BRAINSTORMING_MD}"
  spec.md: "{VERSION_FROM_SPEC_MD}"
  plan.md: "{VERSION_FROM_PLAN_MD}"
---

# Review Feedback: {feature_name}

## Review Date
{timestamp}

## Status
{APPROVED / NEEDS_REVISION}

## Issues Found

### Critical
{list critical issues}

### Major
{list major issues}

### Minor
{list minor suggestions}

## Recommendations
{specific recommendations for improvement}

## Questions
{any questions for clarification}

---
_Reviewed by: reviewer agent_
```

### 5. Process Review Results
Based on reviewer feedback:
- If APPROVED: Inform user they can proceed to execution
- If NEEDS_REVISION: List specific issues and inform about `--revise` option

### 6. Output Summary
```
Feature Review: {feature_name}
{If teammate mode: Review mode: Teammate (reviewer + advocate)}

Status: {APPROVED / NEEDS_REVISION}

Review saved to: .workflow-adapter/doc/feature_{name}/review.md

{If NEEDS_REVISION}
Issues to Address:
1. {issue 1}
2. {issue 2}

Next steps:
- Review feedback: cat .workflow-adapter/doc/feature_{name}/review.md
- Revise plan: /workflow-adapter:feature-plan {name} --revise

{If APPROVED}
All documents pass review.

Next step: /workflow-adapter:execute {name}
```
