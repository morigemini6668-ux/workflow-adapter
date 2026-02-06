# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

workflow-adapter is a Claude Code plugin that enables multi-agent collaboration for feature development. It creates a team of AI agents (workers, reviewer, orchestrator) that work together via Claude Code's built-in Teammate feature for coordinated task execution.

## Architecture

### Plugin Structure

```
.claude-plugin/plugin.json    # Plugin manifest
commands/                     # Slash commands (skill definitions)
hooks/                        # Prompt history hook
templates/                    # Agent and document templates
agents/                       # Default agent configurations
```

### Agent Types

- **Workers** (alpha, beta, gamma...): Execute assigned tasks, named using Greek alphabet
- **Reviewer**: Read-only validation agent
- **Orchestrator**: Validates progress and adds new tasks to plan (single run, no loop)
- **Advocate**: Devil's advocate for critical review (optional, installed via `--advocate`)

### Execution Modes

- **Teammate mode (default)**: Uses Claude Code Teammate feature. Main session acts as team leader, spawns workers/reviewer/advocate as teammates. Tasks managed via TaskCreate/TaskUpdate/TaskList, inter-agent communication via SendMessage.
- **In-session mode (`--in-session`)**: Uses Task tool to spawn subagents within current session. Workers run in parallel, reviewer runs after workers complete.

### Inter-Agent Communication

Agents communicate via markdown files in `.workflow-adapter/doc/feature_{name}/messages/`:
- Filename: `from_{sender}_to_{receiver}_{YYYYMMDD_HHMMSS}.md`
- YAML frontmatter: `from`, `to`, `timestamp`, `type` (request|response|notification), `priority`

### Feature Workflow

1. **install** - Creates agents and directory structure
2. **feature** - Full workflow: context gathering -> brainstorming -> spec -> plan -> review
3. **execute [--complete]** - Runs agents using Teammate coordination
4. **orchestrator** - Validates progress and adds tasks if needed
5. **validate** - Final verification

## Key Files

| File | Purpose |
|------|---------|
| `templates/worker-agent.md` | Worker agent system prompt template |
| `templates/orchestrator-agent.md` | Orchestrator system prompt |
| `templates/advocate-agent.md` | Advocate (Devil's Advocate) system prompt |
| `commands/execute.md` | Agent execution command (Teammate + in-session modes) |
| `commands/feature.md` | Full feature workflow command |

## When Modifying

- **Adding agent types**: Update `templates/` and relevant commands
- **Adding commands**: Create new `.md` file in `commands/` with YAML frontmatter
- **Modifying message protocol**: Update `templates/principle.md` and agent templates

## Dependencies

- Claude Code CLI (`claude`) - For agent execution
