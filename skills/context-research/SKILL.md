---
name: Context Research
description: >-
  This skill should be used when the user asks to "리서치해줘", "조사해줘",
  "컨텍스트 수집해줘", "context 모아줘", "사전 조사", "배경 조사해줘",
  "기술 리서치", "아키텍처 리서치", "research this", "gather context",
  "investigate this topic", "explore this before we start",
  "do a deep dive into", "help me understand the landscape",
  "what should I know before building", "explore options for",
  or wants to gather comprehensive context through parallel expert research
  combined with interactive user refinement before starting implementation work.
  Also used when the feature workflow needs an enhanced context-gathering stage.
---

# Context Research

Gather comprehensive project context by dispatching expert researcher teammates in parallel while simultaneously refining scope through interactive user Q&A. Expert researchers receive progressively refined context as the user clarifies requirements, creating an iterative feedback loop. The final synthesized context is saved to `.workflow-adapter/doc/context/` with YAML frontmatter.

## Core Concept

The skill operates as a **concurrent research + refinement loop**:

```
Main Session (Leader)              Expert Teammates (Background)
─────────────────────              ────────────────────────────
Ask user Q1 ──────────────────────> Researchers start work
Receive answer ───────────────────> Forward refined context
Ask user Q2 ──────────────────────> Researchers adjust focus
Receive answer ───────────────────> Forward refined context
...                                ...
Synthesize all results ◄──────────  Return findings
Save context.md
```

## Workflow

### 1. Parse Request

Extract the research topic from user input. If invoked as part of the feature workflow, receive the feature name and initial description. If invoked independently, ask the user for:
- Research topic or question
- Initial scope description (optional)

### 2. Determine Expert Composition

**Base experts (always dispatched):**
- **codebase-analyst**: Explore the project codebase for relevant patterns, existing implementations, dependencies, and architectural context
- **web-researcher**: Search the web for best practices, similar solutions, industry patterns, and relevant documentation

**Dynamic experts (based on topic):**

Analyze the research topic and determine if additional specialists are needed. Use AskUserQuestion to confirm:

Example (adapt language to match the conversation):
```yaml
question: "Dispatching the following experts: {list}. Add or remove any?"
header: "Experts"
options:
  - label: "Proceed"
    description: "{list of proposed experts with roles}"
  - label: "Add expert"
    description: "Request an additional specialist"
  - label: "Adjust lineup"
    description: "Modify the proposed expert composition"
multiSelect: false
```

**Dynamic expert examples:**
- Architecture topic → spawn `architecture-analyst`
- Security topic → spawn `security-researcher`
- Performance topic → spawn `performance-analyst`
- Infrastructure topic → spawn `infra-researcher`

### 3. Spawn Research Team

Create a team and dispatch experts as teammates running in background:

```yaml
team_name: "wa-research-{topic_slug}"
```

For each expert, spawn as a teammate with:

```yaml
name: "{expert_name}"
subagent_type: "general-purpose"
# bypassPermissions: researchers need to freely read codebase files and
# use web search without interactive approval while running in background
mode: "bypassPermissions"
run_in_background: true
prompt: |
  You are a {expert_role} conducting research on: {topic}

  ## Initial Context
  {initial_description}

  ## Your Task
  Research {specific_focus_area} and report findings.

  ## How to Work
  1. Conduct thorough research within your expertise
  2. Check for messages from the team lead periodically
  3. When you receive updated context, adjust your research focus accordingly
  4. Send interim findings via SendMessage when you discover something significant
  5. When complete, send your final report via SendMessage

  ## Output Format
  Structure your findings as:
  - Key Findings (bulleted list)
  - Relevant Code/Resources (with file paths or URLs)
  - Recommendations
  - Risks or Concerns
```

### 4. Interactive Refinement Loop

While experts research in background, run an interactive Q&A loop with the user. This loop serves dual purposes: (a) refine the research scope, (b) feed refined context to experts.

**Q&A Topics to Explore:**

1. **Scope Clarification**
   - What specific problem to solve?
   - What is in scope vs out of scope?
   - Any constraints or non-negotiables?

2. **Requirements Gathering**
   - Must-have vs nice-to-have features?
   - Performance or scale requirements?
   - Integration points with existing systems?

3. **Technical Preferences**
   - Preferred approaches or patterns?
   - Technologies to use or avoid?
   - Existing conventions to follow?

4. **Priority and Trade-offs**
   - What matters most: speed, quality, maintainability?
   - Acceptable trade-offs?
   - Timeline or urgency considerations?

**After each user response:**

Forward the accumulated context to all active experts:

```yaml
type: "broadcast"
content: |
  ## Updated Context from User

  Q: {question asked}
  A: {user's answer}

  ## Accumulated Scope
  {running summary of all Q&A so far}

  Adjust your research focus based on this updated context.
summary: "Updated research context from user Q&A"
```

**Continue the loop** until:
- Core scope is clear (problem, requirements, constraints defined)
- User indicates they have provided enough context
- All critical questions are answered (typically 3-5 rounds, maximum 7)

### 5. Collect Expert Results

After the Q&A loop concludes:

1. Send a final message to all experts requesting their reports
2. Wait for all expert teammates to respond with findings
3. Collect and organize all research outputs

If an expert is still working, wait with a reasonable timeout. Send a check-in message if needed.

### 6. Synthesize Context Document

Combine user Q&A results and expert research into a unified context document.

**Save to:** `.workflow-adapter/doc/context/{topic_slug}.md`

If invoked as part of the feature workflow, also copy/link to:
`.workflow-adapter/doc/feature_{name}/context.md`

Refer to `references/context-format.md` for the full document format with frontmatter schema.

### 7. Preview and Confirm

Present the synthesized context to the user:

Example (adapt language to match the conversation):
```yaml
question: "Review the research results. Any modifications needed?"
header: "Review"
options:
  - label: "Save as-is"
    description: "Save the context document without changes"
  - label: "Needs edits"
    description: "Modify specific sections or request additional research"
  - label: "More research"
    description: "Dispatch additional experts for specific areas"
multiSelect: false
```

### 8. Cleanup and Output

1. Send `shutdown_request` to all expert teammates
2. Clean up the team
3. Confirm the saved context path to the user

```
Context Research Complete: {topic}

Experts dispatched: {list}
Q&A rounds: {count}
Document saved: .workflow-adapter/doc/context/{topic_slug}.md
{If feature workflow: Also linked: .workflow-adapter/doc/feature_{name}/context.md}

{If feature workflow: Next step: /workflow-adapter:feature-brainstorming {name}}
{If standalone: Context is ready for use in subsequent tasks.}
```

## Integration with Feature Workflow

When used as Stage 0 of the feature workflow:
- Receive feature name and description from the feature command
- Save context to both `context/` and `feature_{name}/` directories
- The feature workflow continues with brainstorming after this completes
- The `depends_on` field in subsequent documents references this context

## Constraints

- Maximum 4 expert teammates to manage complexity and cost
- Q&A loop should complete within 3-5 rounds (maximum 7 to avoid fatigue)
- Each expert should complete within a reasonable timeframe
- Context document should be comprehensive but concise (aim for actionable insights)
- Write context in the same language the conversation is conducted in

## Additional Resources

### Reference Files

- **`references/context-format.md`** - Full context document format with frontmatter schema and section templates
