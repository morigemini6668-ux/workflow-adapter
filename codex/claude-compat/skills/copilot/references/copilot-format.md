# GitHub Copilot Configuration File Formats

## copilot-instructions.md

Location: `.github/copilot-instructions.md`

Project-wide instructions that apply to all Copilot interactions. Simple markdown with optional YAML frontmatter.

```yaml
---
applyTo: "**"
---
```

Best used for: coding style, naming conventions, technology stack declarations, architectural patterns, security requirements.

## Agent Files (.agent.md)

Location: `.github/agents/{name}.agent.md`

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name; defaults to filename |
| `description` | Yes | Brief explanation of capabilities |
| `tools` | No | List of available tools; omit for all tools |
| `target` | No | `vscode` or `github-copilot` to limit availability |

### Example Agent

```markdown
---
name: test-specialist
description: Focuses exclusively on writing and maintaining tests
tools:
  - read
  - search
  - edit
  - terminal
---

# Test Specialist

Focus on test quality and coverage. Never modify production code.

## Responsibilities
- Write unit tests for new features
- Update existing tests when behavior changes
- Ensure all tests pass before reporting completion

## Process
1. Read the relevant source code
2. Identify testable behaviors
3. Write comprehensive tests
4. Run tests to verify they pass
```

### Naming Rules

Filenames must contain only: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`

The `.agent.md` suffix is required for auto-discovery.

## Instruction Files (.instructions.md)

Location: `.github/instructions/{name}.instructions.md`

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name |
| `description` | No | Short description, shown on hover |
| `applyTo` | No | Glob pattern for auto-application (e.g., `**/*.py`) |

### Example Instruction

```markdown
---
name: brainstorming-workflow
description: Structured brainstorming process with research and review
---

# Brainstorming Workflow

Follow this process when asked to brainstorm a topic.

## Steps
1. Clarify the subject with the user
2. Spawn research subagent
3. Collect findings
4. Present organized results
```

If `applyTo` is omitted, the instruction must be manually referenced.

## AGENTS.md

Location: Workspace root or subfolders.

An alternative to `.github/agents/` for defining agent behavior. The nearest `AGENTS.md` file takes precedence. Requires `chat.useAgentsMdFile` setting enabled in VS Code.

## Key Differences from Claude Code Plugins

| Feature | Claude Code Plugin | GitHub Copilot |
|---------|-------------------|----------------|
| Agent discovery | `agents/*.md` in plugin | `.github/agents/*.agent.md` |
| Skill discovery | `skills/*/ORIGINAL.md` | `.github/instructions/*.instructions.md` |
| Project instructions | CLAUDE.md | `.github/copilot-instructions.md` |
| Multi-agent | TeamCreate + SendMessage | Task tool subagents |
| Agent colors | Supported (color field) | Not supported |
| Model selection | `model` field in agent | Limited support |
| MCP servers | Plugin-level config | Org/enterprise only |
| Hooks | PreToolUse, PostToolUse, etc. | Not supported |

## Subagent Pattern (Replacing TeamCreate)

In GitHub Copilot, multi-agent coordination uses the Task tool:

```markdown
## Spawning Subagents

Instead of TeamCreate + SendMessage, spawn independent subagents:

Task({
  description: "Research: gather information on topic",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Research the topic and write results to .workflow-adapter/{subject}/doc/research.md"
})

## Collecting Results

After subagents complete, read their output files:
- .workflow-adapter/{subject}/doc/researcher-results.md
- .workflow-adapter/{subject}/doc/historian-results.md
- .workflow-adapter/{subject}/doc/reviewer-results.md
```

## File-Based Coordination Pattern

Without SendMessage, agents coordinate through files:

```markdown
## Status Files
- `.workflow-adapter/{subject}/status/{agent-name}.json` — agent status
- `.workflow-adapter/{subject}/doc/{agent-name}-results.md` — agent output

## Lock Files (for parallel executers)
- `.workflow-adapter/{subject}/locks/{file-path}.lock` — file modification lock
```
