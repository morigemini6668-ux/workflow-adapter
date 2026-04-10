---
name: brainstorming
description: >
  Multi-agent brainstorming workflow using uniflow. This skill should be used when
  the user asks to "brainstorm", "브레인스토밍", "아이디어 논의", "토론 시작",
  "explore ideas", or mentions starting a brainstorming session.
  Requires a running uniflow session.
allowed-tools: [Bash, Read, Write, Glob, Grep]
argument-hint: "<subject description> [--rounds N]"
---

# Brainstorming Workflow (uniflow native)

You are the **orchestrator** for a multi-agent brainstorming session. You coordinate
historian, researcher, and reviewer agents via `uniflow` CLI to explore a subject.

## Step 1: Determine Subject

If the user provided a subject, use it. Otherwise ask what to brainstorm.
Generate a concise `subject` identifier (lowercase, hyphens, e.g., `api-caching-strategy`).

Parse `--rounds N` flag (default: 2).

Create working directory:
```bash
mkdir -p .workflow-adapter/{subject}/doc
```

## Step 2: Spawn Agents

Spawn three agents with role instructions from this plugin's `references/` directory.
Use `${CLAUDE_PLUGIN_ROOT}` to locate the reference files.

```bash
uniflow spawn historian-1 --role historian \
  --role-file ${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/references/historian.md

uniflow spawn researcher-1 --role researcher \
  --role-file ${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/references/researcher.md

uniflow spawn reviewer-1 --role reviewer \
  --role-file ${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/references/reviewer.md
```

Verify all agents are running:
```bash
uniflow status --json
```

## Step 3: Assign Initial Research Tasks

Create and assign tasks for initial findings:

```bash
uniflow task-add "Gather project context for {subject}" --assign historian-1
uniflow task-add "Research {subject} thoroughly" --assign researcher-1
```

**Do NOT assign reviewer yet** — reviewer acts after initial findings are collected.

## Step 4: Collect Initial Findings

Poll `uniflow status --json` until historian-1 and researcher-1 tasks are completed.
Check outbox.jsonl for results:

```bash
uniflow status --json
```

When both complete, read their output documents from `.workflow-adapter/{subject}/doc/`.

If a researcher needs user input (indicated in outbox summary), relay the question
to the user, then send the answer back:
```bash
uniflow send researcher-1 "User decided: {answer}"
```

## Step 5: Reviewer Assessment

Share findings with the reviewer and assign review task:

```bash
uniflow send reviewer-1 "Review these findings for {subject}:

Historian context: {summarize historian findings}
Research findings: {summarize researcher findings}

Act as Devil's Advocate. Challenge assumptions, find gaps, propose alternatives."

uniflow task-add "Review brainstorming findings for {subject}" --assign reviewer-1
```

Wait for reviewer task completion via `uniflow status --json`.

## Step 6: Moderated Discussion (N rounds)

For each round K of `discussion_rounds`:

**6a. Cross-pollinate findings**

Share each agent's findings with others and ask for reactions. Use `uniflow send`
(default nudge mode — agent responds when idle):

```bash
uniflow send researcher-1 "[Round {K}] Historian found: {summary}. Does this align with your research?"
uniflow send reviewer-1 "[Round {K}] Researcher proposes: {summary}. Challenge this."
uniflow send historian-1 "[Round {K}] Researcher found: {summary}. Historical precedent?"
```

**6b. Collect reactions**

Poll `uniflow status --json` and check outbox.jsonl for responses.
When reactions arrive, relay cross-challenges:

```bash
uniflow send researcher-1 "[Moderator] Reviewer challenges: {critique}. Your response?"
```

For urgent messages (e.g., redirecting off-topic discussion), use interrupt mode:
```bash
uniflow send --interrupt researcher-1 "[Moderator] Please refocus on {subject}."
```

**6c. Convergence check**

After collecting all reactions:
- If unresolved disagreements exist and this is the final round: escalate to user
- If consensus reached: exit loop early
- Otherwise: continue to next round

## Step 7: Save Results

Compile all findings into `.workflow-adapter/{subject}/brainstorming.md` with sections:
Context (Historian), Research Findings (Researcher), Discussion Summary (with Points of
Agreement and Points of Contention), User Decisions, Key Conclusions, Review Notes
(Reviewer), and a Decision Registry table (ID, Decision, Source, Status).

## Step 8: Cleanup

Kill each brainstorming agent individually:
```bash
uniflow kill historian-1
uniflow kill researcher-1
uniflow kill reviewer-1
```

Inform user of completion and suggest next steps.
