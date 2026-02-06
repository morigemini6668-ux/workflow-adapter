# Obsidian Formatting Guide

## Frontmatter (YAML)

Every note starts with YAML frontmatter delimited by `---`:

```yaml
---
title: Note Title
date: 2025-01-15
tags:
  - tag1
  - tag2
---
```

### Tag Conventions

- Lowercase only: `#api-design` not `#API-Design`
- Hierarchical with `/`: `#project/my-app`, `#topic/backend`
- Common prefixes:
  - `project/` - Project-specific tags
  - `topic/` - Subject area tags
  - `type/` - Content type (e.g., `type/decision`, `type/research`, `type/meeting`)
  - `status/` - Status tracking (e.g., `status/draft`, `status/complete`)

### Contextual Frontmatter Fields

| Field | When to Include | Example |
|-------|----------------|---------|
| `aliases` | When note has common alternative names | `["API 인증", "auth 방식"]` |
| `summary` | When content is long or complex | `"JWT vs OAuth2 비교 분석"` |
| `status` | When action items or follow-ups exist | `draft`, `in-progress`, `complete` |
| `related` | When clearly related notes exist | `["[[related-note]]"]` |
| `project` | When tied to a specific project | `my-app` |
| `category` | When content fits a clear category | `architecture`, `design`, `research`, `decision` |

## Wikilinks

Use `[[wikilinks]]` to create connections between concepts:

- `[[concept-name]]` - Link to another note
- `[[concept-name|display text]]` - Link with custom display text
- `[[concept-name#heading]]` - Link to specific section

### When to Use Wikilinks

- Technical concepts that could be their own note (e.g., `[[JWT]]`, `[[OAuth2]]`)
- Project names (e.g., `[[my-app]]`)
- People or teams mentioned (e.g., `[[backend-team]]`)
- Tools or libraries (e.g., `[[React]]`, `[[PostgreSQL]]`)
- Related decisions or discussions (e.g., `[[api-versioning-decision]]`)

Wikilinks don't need to point to existing notes. Obsidian handles broken links gracefully, and they serve as placeholders for future notes.

## Callouts

Use Obsidian callout syntax for important information:

```markdown
> [!note] Title
> Content

> [!warning] Title
> Content

> [!tip] Title
> Content

> [!important] Title
> Content

> [!question] Title
> Content

> [!example] Title
> Content
```

### Recommended Callout Usage

| Callout Type | Use For |
|-------------|---------|
| `[!note]` | Key decisions, important conclusions |
| `[!warning]` | Risks, caveats, things to watch out for |
| `[!tip]` | Best practices, recommendations |
| `[!important]` | Critical information, blockers |
| `[!question]` | Open questions, unresolved items |
| `[!example]` | Code examples, concrete illustrations |

## Content Structure

### Headings

- `# Title` - Note title (usually matches frontmatter `title`)
- `## Section` - Major sections
- `### Subsection` - Subsections within a section

### Task Lists

For action items:
```markdown
- [ ] Pending task
- [x] Completed task
```

### Code Blocks

Preserve code with language annotation:
````markdown
```python
def example():
    pass
```
````

### Tables

For comparisons or structured data:
```markdown
| Option | Pros | Cons |
|--------|------|------|
| A | Fast | Complex |
| B | Simple | Slow |
```

## Language Handling

- Write notes in the same language as the conversation
- Keep technical terms in their original language (usually English)
- Code, commands, and tool names remain in English regardless of note language
- Mixed language is acceptable: e.g., Korean explanation with English technical terms

## Filename Conventions

- Use kebab-case: `api-authentication-discussion.md`
- Keep filenames concise but descriptive
- No date prefix in filename (date is in frontmatter)
- No special characters except hyphens
- Korean filenames are acceptable: `api-인증-논의.md` (but kebab-case English is preferred for portability)
