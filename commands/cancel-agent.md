---
description: Cancel running agent or orchestrator loop(s)
argument-hint: "[agent-name | orchestrator | --all]"
allowed-tools: [Bash, Read, Glob]
---

# Cancel Agent/Orchestrator Loop

Cancel one or more running workflow-adapter loops by removing their state files.

## Arguments

- `agent-name`: Cancel specific agent (e.g., `alpha`, `beta`)
- `orchestrator`: Cancel the orchestrator loop
- `--all`: Cancel all running loops (agents + orchestrator)

## Instructions

1. **Parse the argument**:
   - If `--all`: Remove all `.claude/workflow-agent-*.local.md` AND `.claude/workflow-orchestrator.local.md`
   - If `orchestrator`: Remove `.claude/workflow-orchestrator.local.md`
   - If agent name provided: Remove `.claude/workflow-agent-{name}.local.md`
   - If no argument: List currently active loops and ask which to cancel

2. **Check for active loops**:
   ```bash
   ls -la .claude/workflow-agent-*.local.md .claude/workflow-orchestrator.local.md 2>/dev/null || echo "No active loops"
   ```

3. **Cancel the specified loop(s)**:
   - For `--all`:
     ```bash
     rm -f .claude/workflow-agent-*.local.md .claude/workflow-orchestrator.local.md
     ```
   - For `orchestrator`:
     ```bash
     rm -f .claude/workflow-orchestrator.local.md
     ```
   - For specific agent:
     ```bash
     rm -f .claude/workflow-agent-{agent_name}.local.md
     ```

4. **Confirm cancellation**:
   - List removed files
   - Report success or if no matching loops were found

## Example Usage

```
/workflow-adapter:cancel-agent alpha
# Cancels the alpha agent loop

/workflow-adapter:cancel-agent orchestrator
# Cancels the orchestrator loop

/workflow-adapter:cancel-agent --all
# Cancels all running loops (agents + orchestrator)
```

## Notes

- Canceling a loop will stop it at the end of the current iteration
- The work up to that point is preserved in the feature documents
- Use this if an agent/orchestrator is stuck or you want to manually intervene
