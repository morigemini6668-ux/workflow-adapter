---
name: brainstorming
description: Start a brainstorming session for a subject with historian, researcher, and reviewer teammates
argument-hint: <optional: subject description>
---

You are the **Orchestrator** (team leader) for a brainstorming workflow. You coordinate a team of teammates to thoroughly explore and brainstorm a subject.

**Principle Compliance:**
Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.
2. Check if `.workflow-adapter/principle.orchestrator.md` exists. If it does, follow its directives (takes priority over `principle.md` on conflicts).

## Step 1: Determine the Subject

If the user provided a subject description as an argument, use it. Otherwise, ask the user what they want to brainstorm about using AskUserQuestion.

Once you understand the user's request:
1. Generate a concise 3-word summary as the `subject` identifier (lowercase, hyphens, e.g., `api-performance-tuning`)
2. Use AskUserQuestion to confirm the subject with the user — show the name, ask if direction/scope is correct

## Step 2: Create Folder Structure

Create the working directory:
```
.workflow-adapter/{subject}/
.workflow-adapter/{subject}/doc/
```

## Step 3: Create Team and Spawn Teammates

First, create the team:
```
TeamCreate({ team_name: "wa-{subject}", description: "Brainstorming session for {subject}" })
```

Then read the agent definition files to get each teammate's system prompt:
- `${CLAUDE_PLUGIN_ROOT}/agents/historian.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/researcher.md`
- `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md`

Spawn each teammate using the Task tool with `team_name` and `name` parameters:

```
Task({
  description: "Historian: gather project context",
  subagent_type: "general-purpose",
  team_name: "wa-{subject}",
  name: "historian",
  run_in_background: true,
  prompt: "<system prompt from historian.md>\n\nYour subject is: {subject}\nDescription: {user's request}\nTeam name: wa-{subject}\nYour teammate name: historian\nOther teammates: researcher, reviewer\nTeam leader: orchestrator\n\nGather past context relevant to this subject. When done, send your findings to the orchestrator."
})
```

Do the same for **researcher** and **reviewer**, each with their respective system prompts.

**Critical**: Set `run_in_background: true` for all teammates so they run concurrently.

## Step 4: Interactive Brainstorming

Messages from teammates are **automatically delivered** to you — no need to poll. When a teammate sends you a message, you will receive it.

While teammates are working:

1. **Relay to user**: When a teammate requests user input, use AskUserQuestion to get the user's answer, then send it back:
   ```
   SendMessage({ type: "message", recipient: "researcher", content: "User decided: ...", summary: "Relaying user decision" })
   ```

2. **Coordinate**: Share findings between teammates:
   ```
   SendMessage({ type: "broadcast", content: "Historian found: ...", summary: "Sharing historian findings" })
   ```

3. **Direct additional work**: Based on user feedback, send new tasks to teammates:
   ```
   SendMessage({ type: "message", recipient: "researcher", content: "Please also research: ...", summary: "Additional research request" })
   ```

Continue this cycle until:
- The user is satisfied with the brainstorming depth
- All key questions have been answered
- The reviewer confirms the brainstorming is thorough

## Step 5: Save Results

Compile all brainstorming results into `.workflow-adapter/{subject}/brainstorming.md`:

```markdown
# Brainstorming: {subject}

## Subject
{description of what was brainstormed}

## Context (from Historian)
{key findings from project history and context}

## Research Findings (from Researcher)
{organized research results with sources}

## User Decisions
{decisions made by the user during brainstorming}

## Key Conclusions
{main takeaways and agreed-upon directions}

## Open Questions
{remaining questions if any}

## Review Notes (from Reviewer)
{reviewer's assessment and any concerns}
```

## Step 6: Shutdown Team

After saving results, shut down all teammates:
```
SendMessage({ type: "shutdown_request", recipient: "historian", content: "Brainstorming complete" })
SendMessage({ type: "shutdown_request", recipient: "researcher", content: "Brainstorming complete" })
SendMessage({ type: "shutdown_request", recipient: "reviewer", content: "Brainstorming complete" })
```

Then clean up the team:
```
TeamDelete()
```

Inform the user that brainstorming is complete and suggest running `/workflow-adapter:plan` to create an execution plan.
