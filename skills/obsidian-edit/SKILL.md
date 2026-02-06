---
name: Obsidian Edit
description: >-
  This skill should be used when the user wants to modify, update, or revise
  an existing note in their Obsidian vault. Common triggers include "노트 수정해줘",
  "노트 업데이트해줘", "노트 내용 바꿔줘", "기존 노트에 추가해줘", "노트 편집",
  "vault 노트 수정", "edit my note", "update the note", "revise my note",
  "add to my note", "modify the note", "append to note", or any request to
  change the content of an existing Obsidian vault note.
---

# Obsidian Edit

Modify existing notes in an Obsidian vault. Support operations include updating content, appending sections, revising frontmatter, and restructuring note organization while preserving Obsidian conventions (wikilinks, tags, callouts).

## Workflow

### 1. Resolve Vault Path

Look up the vault path in `.claude/workflow-adapter.local.md`. If frontmatter contains `obsidian_vault_path`, use that value.

If no path is configured, ask the user for their Obsidian vault path using AskUserQuestion (the interactive prompt tool). After receiving the path, save it to `.claude/workflow-adapter.local.md` frontmatter so it persists for future use.

### 2. Identify the Target Note

Determine which note the user wants to edit. The target may be specified by:
- **Explicit filename**: "api-authentication-discussion.md 수정해줘"
- **Title reference**: "API 인증 논의 노트 업데이트해줘"
- **Context**: The note just created or recently discussed in the conversation

If the target is ambiguous, search the vault to find candidate notes:
- Use Glob to match filenames: `*{keyword}*.md`
- Use Grep to search titles in frontmatter: `title:.*{keyword}`

If multiple candidates are found, present the list and ask the user to select one. If no match is found, inform the user and suggest alternative search terms.

### 3. Read the Current Note

Read the full content of the target note. Parse and identify:
- **Frontmatter**: Existing metadata fields and values
- **Structure**: Section headings and their hierarchy
- **Content**: Body text, callouts, task lists, code blocks
- **Links**: Existing `[[wikilinks]]` and tags

### 4. Understand the Edit Request

Analyze what the user wants to change. Common edit types:

- **Append**: Add new sections or content to the end
- **Update section**: Modify a specific section's content
- **Revise frontmatter**: Change tags, status, title, or other metadata
- **Restructure**: Reorganize sections or headings
- **Add links**: Insert new `[[wikilinks]]` or tags
- **Update tasks**: Check off completed items or add new ones
- **Correct content**: Fix errors or update outdated information

### 5. Preview Changes

Present the edited note to the user before saving. Show the changes clearly:
- Display the full updated note as a code block
- Briefly describe what was changed (e.g., "Added '다음 단계' section, updated tags")

Ask the user via AskUserQuestion:
- **Save**: Write the changes to the vault
- **Adjust**: Apply additional modifications, then preview again
- **Cancel**: Discard changes and keep the original note

Repeat this preview step until the user approves. Only proceed to step 6 after explicit approval.

### 6. Write the Updated Note

Overwrite the original file with the updated content. Preserve the original filename unless the user explicitly requests a rename.

Confirm to the user:
- The file path of the updated note
- A brief summary of what was changed

## Edit Guidelines

- Preserve existing frontmatter fields not being modified
- Maintain the note's existing language and writing style
- Keep existing `[[wikilinks]]` and tags intact unless explicitly asked to remove them
- When appending content, match the formatting style of the existing note
- Update the `date` field in frontmatter only if the user requests it
- Add new tags without removing existing ones, unless instructed otherwise

## Frontmatter Updates

When modifying frontmatter fields:
- Preserve YAML formatting (indentation, array style)
- Keep fields in the same order as the original
- Add new fields after existing ones

Common frontmatter edits:
- Adding/removing tags: Modify the `tags` array
- Updating status: Change `status` value (e.g., `draft` -> `complete`)
- Adding related notes: Append to `related` list
- Changing title: Update `title` and optionally rename the file

## Edge Cases

- **Note not found**: Search the vault and present candidates. If none match, inform the user.
- **Conflicting changes**: If the edit would remove important content, warn the user before proceeding.
- **Large notes**: For notes exceeding 500 lines, read and display only the relevant sections during preview rather than the entire file.

## Constraints

- Always preview changes before writing. Never overwrite without user approval.
- Preserve all content not targeted by the edit request.
- Maintain Obsidian compatibility: valid frontmatter, proper wikilink syntax, correct callout format.
- Refer to `references/edit-patterns.md` for detailed editing patterns and frontmatter manipulation techniques.
