---
name: spec
description: |
  Create a technical specification from brainstorming or investigation results.
  Use this skill when the user mentions "spec", "specification", "technical design",
  "interface design", "detailed design", "architecture design", "data model design",
  "API design", "사양", "기술 설계", "인터페이스 설계", "상세 설계", "아키텍처 설계",
  "데이터 모델 설계", "API 설계", "스펙 작성", "spec 작성",
  or when brainstorming produced decisions involving multiple components, API design,
  data models, or 3+ files — even if the user doesn't explicitly say "spec".
  Also use when the user asks "how should we implement this?", "구현 어떻게 하지?",
  "기술적으로 어떻게?", or wants to define interfaces before planning tasks.
argument-hint: "<optional: subject name>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# /spec: Create Technical Specification

You are a **Technical Architect** producing a structured specification from brainstorming or investigation results. The spec provides the HOW for decisions made during brainstorming (the WHAT and WHY).

---

## Step 0: Parse Options

Extract parameters from user arguments:

| Parameter | Default | Example |
|-----------|---------|---------|
| Subject | (auto-detect) | `my-feature`, `spec-step-design` |
| `--yes` | false | Skip confirmation prompt |

```
SUBJECT = $ARGUMENTS[0] or auto-detect from .workflow-adapter/ directories
YES_MODE = true if "--yes" in $ARGUMENTS
```

---

## Step 1: Principle Compliance

Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.spec.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

---

## Step 2: Identify Subject and Read Source

### 2.1 Find the Subject

If SUBJECT was provided as an argument, use it directly. Otherwise, list `.workflow-adapter/` directories and find those containing `brainstorming.md` or `investigation.md`:

```
Glob(".workflow-adapter/*/brainstorming.md")
Glob(".workflow-adapter/*/investigation.md")
```

- If exactly one subject directory is found, use it automatically.
- If multiple directories are found, present them to the user via AskUserQuestion and let them choose.
- If no source documents are found, inform the user:
  ```
  No brainstorming.md or investigation.md found in .workflow-adapter/.
  Please run /workflow-adapter:brainstorming or /workflow-adapter:investigate first.
  ```
  Then stop.

### 2.2 Read Source Documents

Read all available source documents from `.workflow-adapter/{subject}/`:

1. **brainstorming.md** — if it exists, read it fully
2. **investigation.md** — if it exists, read it fully
3. **doc/** directory — if it exists, read research documents within it:
   ```
   Glob(".workflow-adapter/{subject}/doc/*")
   ```
   Read each document for research evidence and technical details.

If neither brainstorming.md nor investigation.md exists, stop with an error message.

### 2.3 Parse the Decision Registry

Extract the Decision Registry table from the source document (brainstorming.md or investigation.md). Record:
- All decision IDs and their statuses (accepted, deferred, rejected)
- The highest decision ID number (for ID continuity in the spec)

If both brainstorming.md and investigation.md exist, merge their registries. Use investigation.md's registry as the primary (it is typically more recent), and add any decisions from brainstorming.md that are not duplicated.

---

## Step 3: Generate Spec

Write the specification to `.workflow-adapter/{subject}/spec.md` using the template below.

**Content Guidelines:**
- Focus on **HOW** — do NOT repeat WHAT or WHY from brainstorming/investigation
- Include actual code-level definitions where applicable (TypeScript interfaces, JSON schemas, DB table schemas, API signatures)
- All technical decisions must reference evidence from the research documents in `doc/`
- Keep the spec **self-contained** — a reader should understand the full technical design from spec.md alone without needing to read brainstorming.md
- Target **200-400 lines**; absolute maximum is **500 lines**
- Decision Registry IDs must continue from the source document's numbering (e.g., if source ends at D7, new spec decisions start at D8)

### spec.md Template

```markdown
# Technical Specification: {subject}

> Generated from brainstorming.md/investigation.md. This spec provides the HOW
> for decisions made during brainstorming (the WHAT and WHY).

## 1. Technical Design Decisions

### Architecture Pattern
{Describe the chosen architecture pattern and rationale}

### Technology / Framework Choices
{List technology choices with justification — reference doc/ research where applicable}

### Component Structure
{Define components, their responsibilities, and boundaries}
{Use a table or diagram for clarity:}

| Component | Responsibility | Depends On |
|-----------|---------------|------------|
| ... | ... | ... |

## 2. Interface Contracts

### API / Method Signatures
{Define endpoints or function signatures with request/response types}

{Example — include actual type definitions:}
```typescript
// Example interface definition
interface ExampleRequest {
  field: string;
}
```

### Data Structures
{Define data models — TypeScript interfaces, JSON schemas, DB tables as applicable}

### Inter-Component Communication
{Describe protocols between components — message formats, event types, file formats}

### File Format Specifications
{If the design produces or consumes files, define their format}

## 3. Non-Functional Requirements

### Performance Constraints
{Concrete, measurable targets:}
- Response time: {e.g., < 200ms p95}
- Throughput: {e.g., 100 requests/second}
- Size limits: {e.g., spec.md <= 500 lines}

### Security Considerations
{Auth, input validation, permissions, data handling}

### Error Handling Strategy
{What errors can occur, how they are handled, user-facing messages}

| Error Condition | Handling | User Message |
|----------------|----------|--------------|
| ... | ... | ... |

### Scalability Assumptions
{Current assumptions and known limits}

## 4. Detailed Acceptance Criteria

### Per-Component Specifications
{Input/output specifications for each component}

### Edge Cases and Error Scenarios
| Scenario | Input | Expected Behavior |
|----------|-------|-------------------|
| ... | ... | ... |

### Success / Failure Conditions
{Concrete examples of what constitutes success and failure}

## 5. Risks & No-gos

### Technical Risks
{Ranked by likelihood x impact, with mitigations}

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ... | ... | ... | ... |

### Rabbit Holes to Avoid
{Things that look tempting but are out of scope — be explicit}
- {Rabbit hole 1}: {Why to avoid it}

### Explicit Scope Boundaries
{What this spec does NOT cover}
- Out of scope: {item}

## 6. Decision Registry

{Inherited from source document — copy the full Decision Registry table below}

| ID | Decision | Source | Status |
|----|----------|--------|--------|
| {D1-DN inherited from source} | {decision text} | {original source section} | {original status} |
| {DN+1 onward: new technical decisions} | {decision text} | Spec: {section name} | accepted |
```

---

## Step 4: Present and Confirm

### 4.1 Present Summary

Prepare a summary of key technical decisions made or refined during spec generation:
- List the most important interface contracts defined
- Highlight any new decisions added to the Decision Registry
- Note any risks or scope boundaries that may surprise the user

### 4.2 Confirm (unless --yes)

If `YES_MODE` is false, present the summary via AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "{summary of key technical decisions}\n\nSpec saved to .workflow-adapter/{subject}/spec.md\n\nDoes this look correct?",
    header: "Technical Specification Summary",
    options: [
      { label: "Approve", description: "Spec looks good" },
      { label: "Revise", description: "I have feedback — let me describe changes" },
      { label: "Cancel", description: "Discard spec.md" }
    ],
    multiSelect: false
  }]
})
```

- **Approve**: Proceed to completion message
- **Revise**: Ask the user what they want changed via AskUserQuestion (free text). Apply their feedback to spec.md, then re-present the summary for confirmation. Repeat until approved or cancelled.
- **Cancel**: Delete spec.md and stop

If `YES_MODE` is true, skip confirmation and proceed directly.

### 4.3 Completion Message

```
Technical specification for '{subject}' generated:
  .workflow-adapter/{subject}/spec.md

Next steps:
  - Run /workflow-adapter:plan {subject} to create an execution plan from this spec
  - Run /workflow-adapter:retrospective to extract session learnings
  - Run /workflow-adapter:archive {subject} to archive decisions as ADRs
```

---

## Important Rules

1. **Spec covers HOW** — do NOT repeat WHAT/WHY from brainstorming. If brainstorming says "We decided to use React because of X", the spec says "React component structure: ..." without re-arguing why React was chosen.
2. **spec.md must be <= 500 lines.** If the technical design is too large, split into a primary spec.md and reference documents in `doc/`.
3. **Include actual code-level definitions** where applicable — TypeScript interfaces, JSON schemas, SQL DDL, API signatures. Prose-only descriptions of interfaces are insufficient.
4. **All technical decisions must be evidence-based** — reference research from brainstorming `doc/` directory. Do not introduce unbacked opinions.
5. **Decision Registry must maintain ID continuity** with the source document. New decisions added during spec generation continue the numbering sequence.
6. **Spec must be usable standalone** — a reader who has NOT read brainstorming.md should still understand the full technical design from spec.md alone. Include enough context (but not the full WHAT/WHY narrative).
