---
name: copilot
description: Converts workflow-adapter plugin components into GitHub Copilot project configuration files. Generates .github/copilot-instructions.md from principles, .github/agents/*.agent.md from agent definitions, and .github/instructions/*.instructions.md from skills. Transforms TeamCreate/SendMessage patterns into Task tool subagent patterns.
disable-model-invocation: true
---

# GitHub Copilot Configuration Generator

This command converts the workflow-adapter plugin into GitHub Copilot compatible project configuration files. The generated files enable similar workflows in GitHub Copilot environments (VS Code Copilot Chat, GitHub Copilot coding agent).

## Key Adaptation Rules

When converting workflow-adapter components to Copilot format, apply these transformations:

| Workflow Adapter | GitHub Copilot |
|------------------|----------------|
| `TeamCreate` / `SendMessage` (teammate) | `Task` tool (subagent) |
| `agents/*.md` | `.github/agents/*.agent.md` |
| `skills/*/ORIGINAL.md` | `.github/instructions/*.instructions.md` |
| `.workflow-adapter/principle.md` | `.github/copilot-instructions.md` |
| `${CLAUDE_PLUGIN_ROOT}` | Repository-relative paths |

**Critical**: Copilot does not have TeamCreate/SendMessage. All multi-agent coordination must use the Task tool with `subagent_type: "general-purpose"` to spawn independent subagents.

## Step 0: Parse Options

Check if `--force` flag is present:
- If `--force`, overwrite existing files without confirmation
- Otherwise, prompt before overwriting

## Step 1: Read Plugin Components

Read all source files from the plugin:

1. **Agents**: Read all `${CLAUDE_PLUGIN_ROOT}/agents/*.md` files
2. **Skills**: Read all `${CLAUDE_PLUGIN_ROOT}/skills/*/ORIGINAL.md` files
3. **Principles**: Read `.workflow-adapter/principle.md` and any `principle.{agent}.md` files if they exist
4. **Plugin manifest**: Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`

If no files are found for a component type (agents, skills, or principles), skip the corresponding generation step and note the omission in the final summary.

## Step 2: Generate copilot-instructions.md

Create `.github/copilot-instructions.md` with project-level instructions.

Source content:
- Plugin description from `plugin.json`
- Content from `.workflow-adapter/principle.md` (if exists)
- General workflow conventions

Template:
```markdown
---
applyTo: "**"
---

# Workflow Adapter - Project Instructions

{plugin description}

## Workflow Conventions

- Working directory: `.workflow-adapter/`
- Subject naming: 3-word lowercase hyphenated identifiers
- Plan format: `.workflow-adapter/{subject}/plan.md`
- Documentation: `.workflow-adapter/{subject}/doc/`

## Principles

{content from principle.md, or "No project-level principles defined."}

## Agent Coordination

This project uses a multi-agent workflow pattern. When coordinating multiple agents:
- Use the Task tool to spawn subagents for parallel work
- Each subagent operates independently with its own context
- The orchestrator (main agent) coordinates by spawning and collecting results
- Do NOT use TeamCreate/SendMessage — use Task tool subagents instead
```

## Step 3: Generate Agent Files

For each agent in `${CLAUDE_PLUGIN_ROOT}/agents/`, create a corresponding `.github/agents/{name}.agent.md`.

### Conversion Rules

1. **Frontmatter**: Convert to Copilot agent format. Refer to `references/copilot-format.md#agent-files-agentmd` for field specifications.
   - Keep `name` and `description` (first paragraph only)
   - Remove `model`, `color` fields (Copilot-incompatible)
   - Remove `<example>` blocks from description (move to body)

2. **Body**: Transform the system prompt:
   - Replace `SendMessage({ type: "message", recipient: "..." })` patterns with Task tool subagent patterns
   - Replace `SendMessage({ type: "broadcast", ... })` with sequential Task tool calls or consolidated reporting
   - Replace `SendMessage({ type: "shutdown_request", ... })` — not needed (subagents terminate naturally)
   - Replace `TeamCreate(...)` / `TeamDelete()` — not needed
   - Keep principle compliance sections as-is (same file paths work)
   - Adapt communication instructions to subagent reporting pattern

3. **Subagent Communication Pattern**:
   Replace teammate messaging with:
   ```markdown
   ## Reporting Results
   After completing assigned work, write results to the designated output file:
   - `.workflow-adapter/{subject}/doc/{agent-name}-results.md`

   The orchestrator will read this file to collect findings.
   ```

### Agent-Specific Adaptations

**Orchestrator** (brainstorming, plan, execute, investigate skills):
- Replace `TeamCreate` + teammate spawning with Task tool subagent spawning:
  ```markdown
  Spawn each agent as an independent subagent:
  Task({
    description: "Researcher: analyze topic",
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "<agent instructions>\n\nSubject: {subject}\nWrite results to: .workflow-adapter/{subject}/doc/researcher-results.md"
  })
  ```
- Replace `SendMessage` relay with: read subagent output files after completion
- Keep AskUserQuestion interactions unchanged

**Executer**:
- Remove SendMessage-based coordination
- Add file-based coordination: lock files or status markers in plan.md
- Keep checkpoint management as-is

**Reviewer**:
- Convert "send issues to orchestrator" to "write review to `.workflow-adapter/{subject}/doc/review-results.md`"
- Keep Devil's Advocate review process unchanged

**Researcher / Historian**:
- Convert "send findings to orchestrator" to "write findings to output file"
- Keep research process and tool usage unchanged

**Enricher** (spawned on-demand during investigate workflow):
- No teammate communication needed — just write results and terminate

## Step 4: Generate Skill Instruction Files

For each skill in `${CLAUDE_PLUGIN_ROOT}/skills/*/ORIGINAL.md`, create `.github/instructions/{name}.instructions.md`.

### Conversion Rules

1. **Frontmatter**: Convert to Copilot instructions format. Refer to `references/copilot-format.md#instruction-files-instructionsmd` for field specifications.
   - Keep `name` and `description`
   - Remove `argument-hint`, `disable-model-invocation` fields

2. **Body**: Transform workflow instructions:
   - Apply the same teammate → subagent transformations as agents
   - Replace `${CLAUDE_PLUGIN_ROOT}/agents/*.md` references with `.github/agents/*.agent.md` references
   - Keep step-by-step workflow structure intact
   - Keep AskUserQuestion usage unchanged

## Step 5: Generate Agent-Specific Principle Files

If `principle.{agent}.md` files exist, append their content as a `## Principles` section at the end of the corresponding `.github/agents/{agent}.agent.md` body, before any closing markers.

## Step 6: Verify and Report

After generating all files, present a summary:

```
Generated GitHub Copilot configuration:
- .github/copilot-instructions.md (project instructions)
- .github/agents/{name}.agent.md (N agent files)
- .github/instructions/{name}.instructions.md (N instruction files)

Key adaptations applied:
- TeamCreate/SendMessage → Task tool subagents
- Agent-to-agent messaging → File-based result exchange
- Plugin paths → Repository-relative paths
```

If `--force` was not used, confirm with the user before writing each file that would overwrite existing content.

## Additional Resources

### Reference Files
- **`references/copilot-format.md`** — Detailed GitHub Copilot file format specification and examples
