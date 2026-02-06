# Obsidian Search Patterns Reference

## Frontmatter Parsing

### Extract Tags from Frontmatter

Obsidian frontmatter uses YAML between `---` delimiters. Tags can appear in two formats:

**Array format:**
```yaml
tags:
  - authentication
  - api-design
  - project/my-app
```

**Inline format:**
```yaml
tags: [authentication, api-design, project/my-app]
```

To search for notes with a specific tag, use Grep patterns:
- Array format: `^\s+-\s+{tag}` within `.md` files
- Inline format: `tags:.*{tag}` within `.md` files
- Hierarchical match: searching `project` should match `project/my-app`

### Extract Other Frontmatter Fields

Common searchable fields:
- `title:` - Note title
- `aliases:` - Alternative names
- `summary:` - One-line summary
- `category:` - Content category
- `project:` - Project name
- `related:` - Related note links
- `status:` - Note status

Pattern to find notes by category:
```
category:\s*{value}
```

Pattern to find notes by project:
```
project:\s*{value}
```

## Wikilink Extraction

### Standard Wikilinks

Pattern to extract `[[wikilinks]]` from a note:
```
\[\[([^\]|]+)(\|[^\]]+)?\]\]
```

This captures:
- `[[note-name]]` → `note-name`
- `[[note-name|display text]]` → `note-name`
- `[[note-name#heading]]` → `note-name#heading`

### Resolving Wikilinks to Files

Obsidian wikilinks resolve to filenames without extension:
- `[[my-note]]` → look for `my-note.md` in the vault
- Case-insensitive matching: `[[My Note]]` matches `my-note.md` or `My Note.md`
- Obsidian supports shortest-unique-name resolution, so `[[note]]` may match `subfolder/note.md`

For flat vault structures (no folders), direct filename match is sufficient:
```
{vault_path}/{wikilink-value}.md
```

## Inline Tags

Obsidian supports inline tags in note body text:
```
This is about #authentication and #security
```

Pattern to find inline tags:
```
(?<!\w)#[\w/-]+
```

Inline tags are equivalent to frontmatter tags for search purposes.

## Search Priority Order

When combining search results, rank by relevance:

1. **Title match** - Note title or filename contains the search term
2. **Frontmatter match** - Tags, aliases, or summary contain the term
3. **Heading match** - Section headings (`##`, `###`) contain the term
4. **Body match** - Note body text contains the term
5. **Wikilink association** - Note is linked from a higher-ranked result

## Directories to Skip

Standard Obsidian directories to exclude from content search:
- `.obsidian/` - Obsidian configuration and plugins
- `.trash/` - Obsidian trash
- `attachments/` or `_attachments/` - Binary attachments
- `assets/` or `_assets/` - Media files
- `_resources/` - Resource files
- Any directory starting with `.` (hidden directories)

## Handling Large Vaults

For vaults with many files:
- Start with Glob to find candidate filenames matching the query
- Then narrow down with Grep on content
- Read frontmatter first (first 20 lines) before reading full content
- Use `limit` parameter when reading files to check relevance before loading fully

## Multi-Language Search

For bilingual vaults (Korean/English):
- Search both Korean and English variants of terms
- Example: searching for "인증" should also try "authentication", "auth"
- Technical terms are often stored in English even in Korean notes
- Check `aliases` in frontmatter for alternative language entries
