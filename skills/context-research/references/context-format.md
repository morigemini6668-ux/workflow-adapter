# Context Document Format

## File Location

- **Standalone research**: `.workflow-adapter/doc/context/{topic_slug}.md`
- **Feature workflow**: `.workflow-adapter/doc/feature_{name}/context.md` (symlink or copy from context/)

## Frontmatter Schema

```yaml
---
title: "{Research Topic Title}"
slug: "{topic-slug-kebab-case}"
date: "{YYYY-MM-DD}"
version: "{CURRENT_TIMESTAMP_ISO8601}"
type: "context"
status: "complete"  # or "partial" if some research is pending
feature: "{feature_name}"  # only if part of feature workflow
experts_dispatched:
  - name: "codebase-analyst"
    focus: "{specific focus area}"
    status: "complete"
  - name: "web-researcher"
    focus: "{specific focus area}"
    status: "complete"
  - name: "{dynamic-expert}"
    focus: "{specific focus area}"
    status: "complete"
qa_rounds: {number}
depends_on: {}
tags:
  - "{tag1}"
  - "{tag2}"
---
```

## Document Structure

```markdown
# Context: {Topic Title}

## Research Summary

Brief overview of the research conducted, experts dispatched, and key findings.

## Scope Definition

### Problem Statement
{Synthesized from user Q&A - what problem are we solving}

### In Scope
- {item 1}
- {item 2}

### Out of Scope
- {item 1}
- {item 2}

### Constraints
- {constraint 1}
- {constraint 2}

## User Requirements

### Must-Have
- {requirement from Q&A}

### Nice-to-Have
- {requirement from Q&A}

### Technical Preferences
- {preference from Q&A}

## Expert Findings

### Codebase Analysis
_Source: codebase-analyst_

#### Relevant Existing Code
- `{file_path}`: {description of relevance}

#### Patterns Found
- {pattern 1}
- {pattern 2}

#### Dependencies and Integration Points
- {dependency/integration point}

#### Recommendations
- {recommendation}

### Web Research
_Source: web-researcher_

#### Best Practices
- {practice with source URL}

#### Similar Solutions
- {solution}: {description} ([source]({url}))

#### Industry Patterns
- {pattern}

#### Recommendations
- {recommendation}

### {Dynamic Expert Title}
_Source: {expert-name}_

#### Key Findings
- {finding}

#### Recommendations
- {recommendation}

## Synthesized Recommendations

Based on combined expert findings and user requirements:

1. **{Recommendation 1}**: {rationale combining expert findings + user input}
2. **{Recommendation 2}**: {rationale}
3. **{Recommendation 3}**: {rationale}

## Risks and Concerns

| Risk | Severity | Source | Mitigation |
|------|----------|--------|------------|
| {risk} | High/Medium/Low | {which expert identified it} | {suggested mitigation} |

## Open Questions

- {Any questions that remain unresolved}

## Q&A Log

Summary of the interactive Q&A session:

| Round | Question | Answer | Impact on Research |
|-------|----------|--------|-------------------|
| 1 | {question} | {answer summary} | {how it affected expert focus} |
| 2 | {question} | {answer summary} | {how it affected expert focus} |

---
_Context research completed: {timestamp}_
_Experts: {comma-separated list}_
_Q&A rounds: {count}_
```

## Frontmatter Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Human-readable title of the research topic |
| `slug` | Yes | Kebab-case identifier used in file naming |
| `date` | Yes | Date the research was conducted (YYYY-MM-DD) |
| `version` | Yes | ISO 8601 timestamp for versioning |
| `type` | Yes | Always `"context"` for context documents |
| `status` | Yes | `"complete"` or `"partial"` |
| `feature` | No | Feature name if part of feature workflow |
| `experts_dispatched` | Yes | List of experts with their focus areas and status |
| `qa_rounds` | Yes | Number of Q&A rounds conducted |
| `depends_on` | Yes | Version references to upstream documents |
| `tags` | No | Tags for categorization and search |

## Naming Convention

**Topic slug**: Convert the topic to kebab-case, removing special characters.

Examples:
- "API 인증 방식 리서치" → `api-auth-research`
- "Performance optimization for search" → `performance-optimization-search`
- "마이크로서비스 아키텍처 조사" → `microservice-architecture-research`

**Filename**: `{topic_slug}.md`

## Versioning

The `version` field uses ISO 8601 timestamps for document versioning. When a context document is updated (e.g., additional research conducted), update the version field. Downstream documents (brainstorming.md, spec.md) reference the context version in their `depends_on` field.
