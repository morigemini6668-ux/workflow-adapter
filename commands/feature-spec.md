---
description: Generate specification from brainstorming
argument-hint: <name>
allowed-tools: [Read, Write, Glob, AskUserQuestion, Task, Teammate, SendMessage, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

Generate a detailed specification from the brainstorming document.

## Arguments
- `$1`: Feature name (required)

## Tasks to Perform

### 1. Validate Feature Exists and Check Versions

**Step 1.1: Check prerequisites exist**
Check that these files exist:
- `.workflow-adapter/doc/feature_$1/context.md` (project context)
- `.workflow-adapter/doc/feature_$1/brainstorming.md` (brainstorming results)

If context.md is missing, gather context first (see feature-brainstorming for how).
If brainstorming.md is missing, inform user to run feature-brainstorming first.

**Step 1.2: Check version dependencies**

If `.workflow-adapter/doc/feature_$1/spec.md` already exists:

1. Read spec.md and extract YAML frontmatter `depends_on` section
2. For each dependency (context.md, brainstorming.md):
   - Read the dependency file's frontmatter `version` field
   - Compare with the version recorded in spec.md's `depends_on`

3. If any dependency's current version differs from recorded version (or if spec.md has no frontmatter/depends_on):

   Show warning to user:
   ```
   spec.md was generated based on older versions of prerequisites.

   Version changes detected:
   - {filename}: recorded {old_version} -> current {new_version}
   ```

   Use AskUserQuestion to let user decide:
   ```yaml
   question: "spec.md의 선행 문서가 업데이트되었습니다. 어떻게 진행할까요?"
   header: "버전 충돌"
   options:
     - label: "재생성 (권장)"
       description: "최신 선행 문서 기반으로 spec.md 새로 생성"
     - label: "기존 유지"
       description: "현재 spec.md 유지 (선행 문서와 불일치할 수 있음)"
     - label: "취소"
       description: "작업 중단"
   ```

   - If "재생성": Continue with spec generation (Step 2)
   - If "기존 유지": Skip spec generation, proceed to summary
   - If "취소": Stop execution

4. If spec.md doesn't exist OR user chose "재생성":
   Proceed to Step 2 (Read Context and Brainstorming Documents)

### 2. Read Context and Brainstorming Documents
@.workflow-adapter/doc/feature_$1/context.md
@.workflow-adapter/doc/feature_$1/brainstorming.md

**Use context to inform the specification:**
- Check for related existing features that might affect design
- Follow project conventions from AGENT.md/CLAUDE.md
- Consider integration points with existing features

### 3. Generate Specification
Based on the brainstorming, create a structured specification document.

Write to `.workflow-adapter/doc/feature_$1/spec.md`:

```markdown
---
version: "{CURRENT_TIMESTAMP_ISO8601}"
depends_on:
  context.md: "{VERSION_FROM_CONTEXT_MD}"
  brainstorming.md: "{VERSION_FROM_BRAINSTORMING_MD}"
---

# Feature Specification: {feature_name}

## 1. Overview

### 1.1 Purpose
{Clear statement of what this feature does and why}

### 1.2 Scope
{What is included and explicitly excluded}

### 1.3 Target Users
{Who will use this feature}

## 2. Functional Requirements

### 2.1 Core Requirements
| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| FR-001 | {name} | Must-Have | {description} |
| FR-002 | {name} | Must-Have | {description} |
| FR-003 | {name} | Nice-to-Have | {description} |

### 2.2 User Stories
- As a {user type}, I want to {action} so that {benefit}
- As a {user type}, I want to {action} so that {benefit}

## 3. Non-Functional Requirements

### 3.1 Performance
- {Performance requirement}

### 3.2 Security
- {Security requirement}

### 3.3 Usability
- {Usability requirement}

## 4. Technical Design

### 4.1 Architecture Overview
{High-level architecture description}

### 4.2 Components
| Component | Responsibility |
|-----------|---------------|
| {name} | {responsibility} |

### 4.3 Data Model
{Data structures and relationships}

### 4.4 API/Interface
{External interfaces if applicable}

## 5. Dependencies
- {Dependency 1}
- {Dependency 2}

## 5.1 Related Existing Features
{From context.md - list existing features that relate to this one}
| Feature | Relationship | Integration Notes |
|---------|--------------|-------------------|
| {existing feature} | {depends on / extends / conflicts with} | {notes} |

## 6. Constraints
- {Constraint 1}
- {Constraint 2}

## 7. Acceptance Criteria
- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] {Criterion 3}

## 8. Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| {edge case} | {behavior} |

## 9. Out of Scope
- {Item explicitly not included}

## 10. Open Questions
- {Any remaining questions to resolve}

---
_Specification generated: {timestamp}_
_Based on: context.md, brainstorming.md_
```

### 3.5. Advocate Review (Automatic)

**Only execute this step if the advocate agent is installed.**

Check if the advocate agent is installed:
- Use Glob to check if advocate.md exists in agents directory (check both `.claude/agents/.local/workflow-adapter/` and `.claude/agents/workflow-adapter/`)
- If advocate is NOT installed, skip this step silently
- If advocate IS installed, proceed:

#### 3.5.1 Spawn Team
```
Teammate.spawnTeam("wa-spec-{name}", "Spec review: {name}")
```

#### 3.5.2 Create Review Task
Use `TaskCreate`:
- subject: "Review spec.md for feature: {name}"
- description: "Critically review the specification. Find requirement gaps, ambiguous definitions, missing edge cases, unrealistic non-functional requirements."

#### 3.5.3 Spawn Advocate
Use `Task` tool to spawn advocate as a teammate:
```yaml
team_name: "wa-spec-{name}"
name: "advocate"
subagent_type: "workflow-adapter:advocate"
mode: "bypassPermissions"
prompt: |
  You are the Devil's Advocate reviewing a feature specification.

  ## Feature: {feature_name}

  ## Documents to Review
  Read: .workflow-adapter/doc/feature_{name}/spec.md
  Context: .workflow-adapter/doc/feature_{name}/context.md
  Brainstorming: .workflow-adapter/doc/feature_{name}/brainstorming.md

  ## Your Task
  Focus on:
  1. Requirement gaps - what requirements are missing?
  2. Ambiguous definitions - what is unclear or could be interpreted multiple ways?
  3. Missing edge cases - what boundary conditions are not addressed?
  4. Unrealistic non-functional requirements - are performance/security targets achievable?
  5. Dependency risks - are all dependencies properly identified?

  Send your feedback to the team lead via SendMessage when done.
  Mark your task as completed via TaskUpdate.
```

#### 3.5.4 Assign Task and Receive Feedback
Assign review task to "advocate" via `TaskUpdate`, then wait for feedback.

#### 3.5.5 Integrate Feedback
Either update spec.md to address critical findings, or add an "Open Challenges" section:
```markdown
## Open Challenges (from Advocate Review)
{challenges and risks identified by the advocate}

---
_Advocate review completed: {timestamp}_
```

#### 3.5.6 Cleanup Team
Send `shutdown_request` to advocate, then call `Teammate.cleanup()`.

### 4. Output Summary
```
Specification for '{feature_name}' generated:
.workflow-adapter/doc/feature_{name}/spec.md
{If advocate installed: Includes advocate review feedback (Open Challenges section)}

Next step: Run /workflow-adapter:feature-plan {name} to create the implementation plan.
```
