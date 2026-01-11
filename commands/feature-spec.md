---
description: Generate specification from brainstorming
argument-hint: <name>
allowed-tools: [Read, Write, Glob, AskUserQuestion]
---

Generate a detailed specification from the brainstorming document.

## Arguments
- `$1`: Feature name (required)

## Tasks to Perform

### 1. Validate Feature Exists
Check that these files exist:
- `.workflow-adapter/doc/feature_$1/context.md` (project context)
- `.workflow-adapter/doc/feature_$1/brainstorming.md` (brainstorming results)

If context.md is missing, gather context first (see feature-brainstorming for how).
If brainstorming.md is missing, inform user to run feature-brainstorming first.

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

### 4. Output Summary
```
Specification for '{feature_name}' generated:
.workflow-adapter/doc/feature_{name}/spec.md

Next step: Run /workflow-adapter:feature-plan {name} to create the implementation plan.
```
