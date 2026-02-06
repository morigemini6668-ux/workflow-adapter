# Obsidian Edit Patterns Reference

## Frontmatter Manipulation

### Adding a Tag

Original:
```yaml
tags:
  - authentication
  - api-design
```

After adding `backend`:
```yaml
tags:
  - authentication
  - api-design
  - backend
```

### Updating Status

Original:
```yaml
status: draft
```

Updated:
```yaml
status: complete
```

### Adding Related Notes

Original (no related field):
```yaml
tags:
  - auth
```

After adding related:
```yaml
tags:
  - auth
related:
  - "[[jwt-implementation]]"
  - "[[oauth2-setup]]"
```

## Content Editing Patterns

### Appending a Section

Insert new sections before the last section or at the end of the file. Match the heading level of existing sections.

If the note ends with a task list section, insert new content sections before it to keep tasks at the bottom.

### Updating a Specific Section

Identify the section by its heading. Replace content between the heading and the next heading of the same or higher level.

For example, to update `## 비교 분석`:
- Find the line `## 비교 분석`
- Replace everything until the next `##` heading (or end of file)
- Preserve the heading itself

### Checking Off Tasks

Original:
```markdown
- [ ] JWT 라이브러리 선정
- [ ] 토큰 만료 정책 결정
```

After checking off:
```markdown
- [x] JWT 라이브러리 선정
- [ ] 토큰 만료 정책 결정
```

### Adding a Callout

Insert callouts using Obsidian syntax:
```markdown
> [!note] New Decision
> Updated decision based on latest discussion.
```

Place callouts within the relevant section, typically after the explanatory text.

## Wikilink Updates

### Adding New Links

Insert `[[wikilinks]]` naturally within the text where the concept is mentioned. Avoid adding orphan link lists unless explicitly requested.

### Renaming Links

When updating a concept name, use Edit with `replace_all` to update all occurrences:
- `[[old-name]]` -> `[[new-name]]`
- `[[old-name|display text]]` -> `[[new-name|display text]]`

## Preserving Formatting

### Indentation

Match the existing indentation style:
- If the note uses 2-space indentation, maintain it
- If using tabs, maintain tabs

### Line Spacing

Match the existing blank line patterns:
- Most Obsidian notes use one blank line between sections
- Some use two blank lines before `##` headings

### Code Blocks

Preserve existing code block formatting:
- Language annotation (```python, ```yaml, etc.)
- Indentation within code blocks
- Blank lines within code blocks

## Multi-Language Considerations

- Preserve the note's primary language when editing
- Keep technical terms in their original language
- When adding new content, match the language of the surrounding text
- Mixed Korean/English is common and acceptable
