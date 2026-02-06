# workflow-adapter

Multi-agent workflow system for collaborative feature development in Claude Code.

## Overview

workflow-adapter enables multi-agent collaboration for feature development. It creates a team of AI agents that work together using Claude Code's Teammate feature, communicating via messages and following a structured workflow from brainstorming to implementation.

## Installation

```bash
claude --plugin-dir /path/to/workflow-adapter
```

Or copy to your Claude plugins directory.

## Quick Start

1. **Initialize the workflow system**
   ```
   /workflow-adapter:install 3
   ```
   This creates 3 worker agents (alpha, beta, gamma) plus reviewer and orchestrator.

2. **Start a feature**
   ```
   /workflow-adapter:feature my-feature "Description of what to build"
   ```
   This runs the complete workflow: brainstorming -> spec -> plan -> review.

3. **Execute agents**
   ```
   /workflow-adapter:execute my-feature
   ```
   Runs all agents using Teammate coordination to implement the feature.

4. **Validate completion**
   ```
   /workflow-adapter:validate my-feature
   ```
   Verifies all tasks are complete and reviewed.

## Commands

| Command | Description |
|---------|-------------|
| `/workflow-adapter:install [count]` | Initialize with N worker agents (default: 3) |
| `/workflow-adapter:feature-brainstorming <name> [desc]` | Interactive brainstorming session |
| `/workflow-adapter:feature-spec <name>` | Generate specification from brainstorming |
| `/workflow-adapter:feature-plan <name>` | Create implementation plan with agent assignments |
| `/workflow-adapter:feature-review <name>` | Review documents with reviewer agent |
| `/workflow-adapter:feature <name> [desc]` | Run complete workflow (all steps) |
| `/workflow-adapter:execute <name> [--in-session]` | Execute all agents (teammate or in-session) |
| `/workflow-adapter:orchestrator <name> [--complete]` | Coordinate workflow until completion |
| `/workflow-adapter:validate [name]` | Validate workflow completion |
| `/workflow-adapter:teammate-status [team]` | Check team execution status |

## Directory Structure

After installation, this structure is created in your project:

```
.workflow-adapter/
├── doc/
│   ├── principle.md  # Collaboration guidelines
│   └── feature_*/    # Feature documents
│       ├── context.md
│       ├── brainstorming.md
│       ├── spec.md
│       ├── plan.md
│       └── messages/  # Inter-agent communication

.claude/agents/workflow-adapter/   # Agent definitions
├── alpha.md
├── beta.md
├── gamma.md
├── reviewer.md
└── orchestrator.md

.claude/commands/workflow-adapter/  # Dynamic agent commands
├── alpha.md
├── beta.md
├── gamma.md
├── reviewer.md
└── orchestrator.md
```

## Agent Roles

### Worker Agents (alpha, beta, gamma, ...)
- Execute assigned tasks from the feature plan
- Communicate via message files or SendMessage (in teammate mode)
- Follow project principles

### Reviewer
- Validates implementations against specifications
- Reviews code quality
- Provides feedback

### Orchestrator
- Coordinates between agents
- Monitors progress
- Resolves conflicts
- Validates completion

### Advocate (optional)
- Devil's advocate for critical review
- Challenges assumptions and identifies risks
- Installed via `--advocate` flag on install

## Execution Modes

### Teammate Mode (Default)
Uses Claude Code's built-in Teammate feature:
- Main session acts as team leader/orchestrator
- Workers, reviewer, and advocate spawned as teammates
- Tasks managed via TaskCreate/TaskUpdate/TaskList
- Inter-agent communication via SendMessage
- Supports parallel execution with dependency management

### In-Session Mode (`--in-session`)
Uses Task tool to spawn subagents:
- Each agent runs as a subagent via Task tool
- Workers run in parallel
- Reviewer runs after workers complete
- Results returned to main session

## Message Protocol

Agents communicate through markdown files:

**Location**: `.workflow-adapter/doc/feature_{name}/messages/`

**Naming**: `from_{sender}_to_{receiver}_{timestamp}.md`

**Format**:
```markdown
---
from: alpha
to: beta
timestamp: 2025-01-09T14:30:22
type: request
priority: normal
---

## Subject
Request for API design review

## Content
Please review the API design in spec.md section 4.4

## Action Required
Provide feedback on the endpoint structure
```

## Workflow Stages

1. **Brainstorming** - Interactive Q&A to gather requirements
2. **Specification** - Structured document with requirements and design
3. **Planning** - Task breakdown with agent assignments
4. **Review** - Validation of documents before implementation
5. **Execution** - Parallel agent work via Teammate coordination
6. **Validation** - Final verification by orchestrator and reviewer

## Configuration

### Agent Count
The `install` command accepts a count parameter (1-24):
```
/workflow-adapter:install 5  # Creates: alpha, beta, gamma, delta, epsilon
```

### Advocate Agent
Install the Devil's Advocate agent for critical review:
```
/workflow-adapter:install 3 --advocate
```

## Requirements

- **Claude Code CLI** - v1.0.0 or higher
- **Bash** - Unix/Linux or Git Bash on Windows

## Security Considerations

### Agent Permissions
When agents run via teammate mode, they operate with `bypassPermissions` mode to allow autonomous operation. This means agents can:
- Read and write files
- Execute bash commands
- Modify your codebase

**Recommendations:**
- Review the generated plan before running `execute`
- Use `--in-session` mode for more control
- Run in a sandboxed environment for sensitive projects

### Input Validation
Agent names and feature names are validated to prevent path traversal attacks. Only lowercase letters, numbers, hyphens, and underscores are allowed.

## License

MIT
