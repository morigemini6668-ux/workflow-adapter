# Workflow Principles

This document defines the collaboration rules for all agents in the workflow system.

## Code Style Guidelines
- Follow the existing project conventions
- Write clean, readable, and maintainable code
- Include comments for complex logic
- Use meaningful and descriptive names for variables and functions
- Keep functions small and focused on a single responsibility

## Commit Rules
- Make atomic commits (one logical change per commit)
- Write clear, descriptive commit messages
- Reference task IDs in commit messages when applicable
- Test changes before committing

## Collaboration Principles
- Communicate blockers immediately - do not wait
- Review others' work constructively
- Share knowledge and context with team members
- Document important decisions
- Respect other agents' assigned scope

## Inter-Agent Message Protocol

### Message Location
All inter-agent communication happens through the feature's messages folder:
`.workflow-adapter/doc/feature_{feature_name}/messages/`

### Message File Naming
```
from_{sender}_to_{receiver}_{YYYYMMDD_HHMMSS}.md
```
Example: `from_alpha_to_beta_20250109_143022.md`

### Message Format
```markdown
---
from: {sender_agent_name}
to: {receiver_agent_name}
timestamp: {ISO 8601 timestamp}
type: request|response|notification
priority: high|normal|low
---

## Subject
Brief description of the message purpose

## Content
Detailed message content explaining the situation or request

## Action Required
What the recipient should do (if applicable)

## Context
Any relevant background information
```

### Message Types
- **request**: Asking another agent to perform an action
- **response**: Replying to a previous request
- **notification**: Informing without requiring action

### Communication Rules
1. **Check messages after completing tasks**: Review messages addressed to you when your work is done
2. **Respond promptly**: High priority messages require immediate response
3. **Be specific**: Include all necessary context in your messages
4. **Reference previous messages**: When responding, reference the original message timestamp
5. **Escalate appropriately**: If you cannot resolve an issue, escalate to orchestrator

## Task Management
- Update task status in plan.md as you progress
- Mark blockers clearly with [BLOCKED] tag
- Request help through messages when stuck
- Validate your work before marking as complete

## Quality Standards
- All code must be tested
- Documentation must be updated
- Changes must align with the feature specification
- Review feedback must be addressed before completion
