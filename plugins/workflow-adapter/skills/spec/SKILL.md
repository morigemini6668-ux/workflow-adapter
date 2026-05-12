---
name: spec
description: |
  Create a technical specification from brainstorming or investigation results.
  Spawns a reviewer to validate the specification before user confirmation.
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
  - Agent
  - LSP
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# /spec: Create Technical Specification

You are a **Technical Architect** producing a structured specification from brainstorming or investigation results. The spec provides the HOW for decisions made during brainstorming (the WHAT and WHY).

---

## User Interaction Policy

- **Every `AskUserQuestion` call in this skill must include a free-form option**: `{ label: "Other / ask", description: "I want to type freely or ask a question before deciding" }`. When selected, read the user's typed reply and handle it (answer the question, apply the feedback, or re-ask with their context). Never force the user into preset options.
- **Final approval question — chain option:** The final approve/confirm question in Step 5.2 MUST include an additional `{ label: "Approve + start plan", description: "Approve and immediately launch /workflow-adapter:plan for this subject" }` option. When selected, complete the completion-message step, then invoke `Skill({ skill: "workflow-adapter:plan", args: "{subject}" })`.
- **Backlog handling:** When reading `.workflow-adapter/backlog/`, consider only items whose frontmatter has `status: pending`. Skip `consumed` and `deferred`. If any pending item is incorporated into this spec session, update that item's frontmatter `status: pending → consumed` before finishing.

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

## Step 4: Reviewer Validation

Spawn a reviewer as a **foreground Task** after writing `spec.md` and before presenting the spec to the user.

Read the reviewer system prompt from `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`, then spawn:

```
Task({
  description: "Reviewer: validate spec",
  subagent_type: "general-purpose",
  run_in_background: false,
  prompt: "<system prompt from reviewer.md>\n\nYour subject is: {subject}\n\nYou are reviewing .workflow-adapter/{subject}/spec.md before it is presented to the user.\n\nBefore starting:\n1. Check .workflow-adapter/principle.md if it exists — follow it.\n2. Check .workflow-adapter/principle.reviewer.md if it exists — it takes priority.\n\nReview these files:\n- .workflow-adapter/{subject}/spec.md\n- .workflow-adapter/{subject}/brainstorming.md (if exists)\n- .workflow-adapter/{subject}/investigation.md (if exists)\n- All files in .workflow-adapter/{subject}/doc/ (if any)\n\nVerify:\n- All 6 spec sections are present: Technical Design Decisions, Interface Contracts, Non-Functional Requirements, Acceptance Criteria, Risks & No-gos, Decision Registry\n- The spec focuses on HOW and does not duplicate WHAT/WHY narrative from brainstorming or investigation\n- Interface contracts include concrete types, schemas, signatures, or file formats where applicable\n- Non-functional requirements have measurable targets rather than vague goals\n- Decision Registry preserves source decisions and continues IDs correctly for new technical decisions\n- Risks include mitigations, and no-gos/scope boundaries are explicit\n- spec.md is <= 500 lines\n\nWrite your review to .workflow-adapter/{subject}/spec-review.md in this format:\nStatus: PASS or NEEDS REVISION\nChecklist Results:\n| Criterion | Result | Notes |\n|-----------|--------|-------|\nIssues:\n- [CRITICAL|WARNING|SUGGESTION] {description}\nRecommendations:\n- {specific text or section to add/change in spec.md}\n\nReturn only the Status line plus a one-paragraph summary."
})
```

If the reviewer returns `NEEDS REVISION`:
- Apply all CRITICAL fixes directly to `spec.md`.
- Apply WARNING-level suggestions only when they improve clarity, measurability, or implementation readiness without broadening scope.
- Spawn the reviewer Task once more for re-review.
- If the second review still returns `NEEDS REVISION`, do not loop further. Preserve the unresolved issues in `spec-review.md` and include them in the user-facing summary.

If the reviewer fails to spawn or becomes unresponsive:
- Inform the user that automatic spec review could not be completed.
- Create `.workflow-adapter/{subject}/spec-review.md` with `Status: REVIEW UNAVAILABLE` and the failure reason if possible.
- Continue to Step 5 with `Reviewer Concerns: Review unavailable`.
- Do not block the workflow solely on reviewer failure.

---

## Step 5: Present and Confirm

### 5.1 Present Summary

Prepare a summary of key technical decisions made or refined during spec generation:
- List the most important interface contracts defined
- Highlight any new decisions added to the Decision Registry
- Note any risks or scope boundaries that may surprise the user
- Include reviewer status and any unresolved reviewer concerns from `spec-review.md`

### 5.2 Confirm (unless --yes)

If `YES_MODE` is false, present the summary via AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "{summary of key technical decisions}\n\nReviewer status: {PASS / NEEDS REVISION / Review unavailable}\nReviewer concerns: {unresolved concerns, or 'None'}\n\nSpec saved to .workflow-adapter/{subject}/spec.md\nReview saved to .workflow-adapter/{subject}/spec-review.md\n\nDoes this look correct?",
    header: "Technical Specification Summary",
    options: [
      { label: "Approve", description: "Spec looks good — stop here" },
      { label: "Revise", description: "I have feedback — let me describe changes" },
      { label: "Cancel", description: "Discard spec.md" },
      { label: "Other / ask", description: "I want to type freely or ask a question before deciding" },
      { label: "Approve + start plan", description: "Approve and immediately launch /workflow-adapter:plan for this subject" }
    ],
    multiSelect: false
  }]
})
```

- **Approve**: Proceed to completion message
- **Revise**: Ask the user what they want changed via AskUserQuestion (free text). Apply their feedback to spec.md, then re-present the summary for confirmation. Repeat until approved or cancelled.
- **Cancel**: Delete spec.md and spec-review.md, then stop

If `YES_MODE` is true, skip confirmation and proceed directly.

### 5.3 Completion Message

```
Technical specification for '{subject}' generated:
  .workflow-adapter/{subject}/spec.md
  .workflow-adapter/{subject}/spec-review.md

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
