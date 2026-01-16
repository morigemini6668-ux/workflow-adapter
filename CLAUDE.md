# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

workflow-adapter is a Claude Code plugin that enables multi-agent collaboration for feature development. It creates a team of AI agents (workers, reviewer, orchestrator) that work together via file-based message passing and a Stop hook mechanism for autonomous iteration.

## Architecture

### Plugin Structure

```
.claude-plugin/plugin.json    # Plugin manifest
commands/                     # Slash commands (skill definitions)
hooks/                        # Stop hook for agent iteration
scripts/                      # Execution scripts
templates/                    # Agent and document templates
agents/                       # Default agent configurations
```

### Stop Hook Mechanism

The core of agent autonomy is in `hooks/agent-stop-hook.sh`. It:
- Reads state files from `.claude/workflow-agent-*.local.md`
- Checks transcript for completion signals (`TASKS_COMPLETE`, `REVIEW_COMPLETE`, `WAITING_FOR_DEPENDENCY`)
- Outputs JSON `{"decision": "block", "reason": <prompt>}` to continue iteration
- Removes state file and exits 0 when complete

State files use YAML frontmatter with: `agent_name`, `feature_name`, `iteration`, `max_iterations`, `completion_signal`, `check_plan_completion`.

### Agent Types

- **Workers** (alpha, beta, gamma...): Execute assigned tasks, named using Greek alphabet
- **Reviewer**: Read-only validation agent, outputs `REVIEW_COMPLETE`
- **Orchestrator**: Validates progress and adds new tasks to plan (single run, no loop)

### Inter-Agent Communication

Agents communicate via markdown files in `.workflow-adapter/doc/feature_{name}/messages/`:
- Filename: `from_{sender}_to_{receiver}_{YYYYMMDD_HHMMSS}.md`
- YAML frontmatter: `from`, `to`, `timestamp`, `type` (request|response|notification), `priority`

### Feature Workflow

1. **install** - Creates agents and directory structure
2. **feature** - Full workflow: context gathering -> brainstorming -> spec -> plan -> review
3. **execute [--complete]** - Runs agents in parallel via `scripts/execute-agents.sh`
4. **orchestrator** - Validates progress and adds tasks if needed
5. **validate** - Final verification

## Key Files

| File | Purpose |
|------|---------|
| `hooks/agent-stop-hook.sh` | Iteration control via Stop hook API |
| `scripts/execute-agents.sh` | Parallel agent launcher |
| `templates/worker-agent.md` | Worker agent system prompt template |
| `templates/orchestrator-agent.md` | Orchestrator system prompt |
| `commands/feature.md` | Full feature workflow command |

## Development Commands

```bash
# Test the hook script (with mock input)
echo '{"transcript_path": "/tmp/test.json"}' | ./hooks/agent-stop-hook.sh

# Run execute script
./scripts/execute-agents.sh <feature_name> [max_iterations] [--complete]
```

## When Modifying

- **Adding agent types**: Update `templates/`, `scripts/greek-alphabet.txt`, and hook patterns
- **Changing completion signals**: Update hook script signal detection and agent templates
- **Adding commands**: Create new `.md` file in `commands/` with YAML frontmatter
- **Modifying message protocol**: Update `templates/principle.md` and agent templates

## Dependencies

- `jq` - Required for JSON parsing in hooks
- Claude Code CLI (`claude`) - For `--print` and `--dangerously-skip-permissions` execution
