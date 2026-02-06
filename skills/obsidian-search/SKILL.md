---
name: Obsidian Search
description: >-
  This skill should be used when the user wants to search their Obsidian vault
  for notes, references, or previously recorded information to use as context
  in the current conversation. Common triggers include "노트에서 찾아줘",
  "노트 검색해줘", "vault에서 찾아봐", "이전에 정리한 거 찾아줘", "관련 노트 찾아줘",
  "obsidian에서 검색", "내 노트에서", "search my notes", "find in vault",
  "look up in obsidian", "find notes about", "what did I write about",
  or any request to retrieve information from an Obsidian vault.
---

# Obsidian Search

Search and retrieve information from an Obsidian vault to provide as context in the current conversation. Combine keyword search, frontmatter tag filtering, and wikilink traversal for comprehensive note discovery.

## Workflow

### 1. Resolve Vault Path

Look up the vault path in `.claude/workflow-adapter.local.md`. If frontmatter contains `obsidian_vault_path`, use that value.

If no path is configured, ask the user for their Obsidian vault path using AskUserQuestion (the interactive prompt tool). After receiving the path, save it to `.claude/workflow-adapter.local.md` frontmatter so it persists for future use.

Expected frontmatter structure:
```yaml
---
obsidian_vault_path: /Users/username/ObsidianVault
---
```

Verify the path exists before proceeding. If invalid, prompt the user to correct it.

### 2. Understand the Query

Analyze what the user is looking for. The query may be:
- **Explicit**: "JWT 관련 노트 찾아줘" - clear keyword or topic
- **Contextual**: "이전에 논의했던 인증 방식" - requires interpreting the current conversation context
- **Broad**: "백엔드 관련 노트들" - requires tag-based or multi-keyword discovery

Extract search terms from the user's request. When the request is contextual, derive relevant keywords from the current conversation topic. For bilingual terms, prepare both Korean and English variants (e.g., "인증" and "authentication").

### 3. Search Strategy

Apply search methods in the following order, combining results for comprehensive coverage. All searches should be case-insensitive.

#### 3a. Keyword Search

Use Grep to search across all `.md` files in the vault. Example:

```
Grep pattern: "JWT" path: {vault_path} glob: "*.md" (case-insensitive)
```

Also use Glob to find files whose names match the search term:

```
Glob pattern: "*{keyword}*.md" path: {vault_path}
```

Try both Korean and English variants of the term. Technical terms often appear in English even in Korean notes.

See `references/search-patterns.md` > "Multi-Language Search" for bilingual search guidance.

#### 3b. Tag-Based Search

Search frontmatter tags to find topically related notes:

```
Grep pattern: "tags:.*{keyword}" path: {vault_path} glob: "*.md"
Grep pattern: "^\s+-\s+{keyword}" path: {vault_path} glob: "*.md"
```

Also search for inline tags in note body text:

```
Grep pattern: "#{keyword}" path: {vault_path} glob: "*.md"
```

Match hierarchical tags: searching `project` should also match `project/my-app`.

See `references/search-patterns.md` > "Frontmatter Parsing" for detailed tag patterns.

#### 3c. Wikilink Traversal

When an initial note is found, extract `[[wikilinks]]` to discover related notes:

```
Pattern: \[\[([^\]|]+)(\|[^\]]+)?\]\]
```

For each extracted link:
1. Resolve to a filename: `{vault_path}/{link-value}.md`
2. Check if the linked note exists
3. Read it if relevant to the query

Follow one level deep only to prevent unbounded traversal.

See `references/search-patterns.md` > "Wikilink Extraction" for resolution details.

### 4. Read and Filter Results

For each matching note:
1. Read frontmatter first (first 20 lines) to check relevance quickly
2. If frontmatter looks relevant, read full content
3. Assess whether the content addresses the user's query
4. Rank by relevance: title match > frontmatter match > heading match > body match > wikilink association

Limit to the **5 most relevant notes** to avoid context overload. If more than 5 match, present a brief list of titles and tags, then ask the user which to examine further.

### 5. Present as Context

Provide the retrieved information to the user:
- Summarize each relevant note briefly (title, key points)
- Quote specific sections that directly address the user's query
- Indicate the source note filename for each piece of information
- Use the content to inform the ongoing conversation

Format the presentation as:

```
Found relevant notes:

**{note-title}** (`{filename}`)
> [relevant excerpt or summary]

**{note-title-2}** (`{filename-2}`)
> [relevant excerpt or summary]
```

When the user's question can be answered directly from the notes, synthesize the information into a direct answer while citing the source notes.

## Search Tips

- Search exact English terms first for technical queries (e.g., `JWT`, `OAuth2`)
- Start with tag search for broad topics before keyword search
- When a note contains `related:` in frontmatter, read those linked notes too
- Check `aliases` in frontmatter as alternative search targets
- Read frontmatter before full content to quickly assess relevance

## Edge Cases

- **No results found**: Inform the user that no matching notes exist. Suggest alternative search terms or offer to broaden the search.
- **Too many results**: Present the top 5 with a count of total matches. Ask the user to narrow down.
- **Vault path missing or invalid**: Prompt the user to configure or correct the vault path.
- **Non-markdown files**: Skip binary files and non-`.md` files in the vault.

## Constraints

- Never modify vault contents. This skill is strictly read-only.
- Limit wikilink traversal to one level deep to prevent context explosion
- Cap at 5 full note reads per search to manage context window usage
- Skip `.obsidian/`, `.trash/`, `attachments/`, `assets/`, `_resources/`, and hidden directories
- Use case-insensitive matching for all searches

## Formatting Reference

Consult `references/search-patterns.md` for detailed Obsidian-specific search patterns, frontmatter parsing techniques, wikilink extraction methods, and large vault handling strategies.
