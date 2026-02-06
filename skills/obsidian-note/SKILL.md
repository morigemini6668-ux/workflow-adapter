---
name: Obsidian Note
description: >-
  This skill should be used when the user asks to "노트 정리해줘", "노트로 만들어줘",
  "obsidian에 저장해줘", "obsidian에 정리", "vault에 저장", "논의 내용 정리해줘",
  "대화 내용 정리", "지금까지 내용 정리", "마크다운으로 정리", "obsidian 노트 작성",
  "save to obsidian", "write notes", "create a note", "summarize this conversation",
  "organize into a note", "save my notes", "export to obsidian", or wants to
  capture, organize, and persist the current AI conversation as a structured
  Obsidian-compatible markdown note with frontmatter, wikilinks, and tags.
---

# Obsidian Note

Summarize and organize AI conversation content into Obsidian-compatible markdown notes. This skill produces flat-structure notes with YAML frontmatter metadata, `[[wikilink]]` cross-references, and tag-based grouping.

## Workflow

### 1. Determine Vault Path

Look up the vault path in `.claude/workflow-adapter.local.md`. If the `obsidian_vault_path` field exists in the frontmatter, use that path.

If no path is configured, ask the user for their Obsidian vault path using AskUserQuestion. After receiving the path, save it to `.claude/workflow-adapter.local.md` frontmatter so it persists for future use.

Example `.claude/workflow-adapter.local.md` frontmatter:
```yaml
---
obsidian_vault_path: /Users/username/ObsidianVault
---
```

### 2. Analyze Conversation

Review the entire conversation to identify:
- **Main topic and subtopics** discussed
- **Key decisions** made during the discussion
- **Action items** or next steps mentioned
- **Technical details** worth preserving
- **Related concepts** that could link to other notes

For long conversations (many back-and-forth exchanges), prioritize capturing decisions, conclusions, and actionable outcomes over raw discussion details. Summarize exploratory discussion into concise insights rather than reproducing it verbatim.

When a conversation covers multiple unrelated topics, consolidate into a single note with clearly separated sections. Apply shared tags to group the note with related content from other sessions.

### 3. Generate Frontmatter

Construct YAML frontmatter with these fields:

**Required fields:**
- `title`: Concise, descriptive title of the note
- `date`: Current date in `YYYY-MM-DD` format
- `author`: Author name, obtained by running `git config user.name`
- `tags`: Array of relevant tags for grouping related notes

**Contextual fields (add when relevant):**
- `aliases`: Alternative names for the note (for Obsidian search)
- `summary`: One-line summary of the note content
- `status`: e.g., `draft`, `in-progress`, `complete`
- `related`: List of `[[wikilinks]]` to potentially related notes
- `project`: Project name if discussion is project-specific
- `category`: Content category (e.g., `architecture`, `design`, `research`, `decision`)

Determine which contextual fields to include based on the conversation content. For example, include `project` only when a specific project was discussed, include `status` when action items remain.

### 4. Compose Note Content

Structure the note body following Obsidian conventions:

- Use `## Heading` for major sections
- Use `[[wikilink]]` to reference concepts, tools, or topics that could be separate notes
- Use tags inline where relevant (e.g., `#architecture`, `#decision`)
- Use callouts for important information:
  ```markdown
  > [!note] Key Decision
  > Description of the decision made
  ```
- When multiple topics were discussed, organize under clear section headings within a single note
- Group related topics under the same tags for Obsidian tag-based navigation

### 5. Write the Note

Generate the filename as `{title-in-kebab-case}.md` (flat structure, no subdirectories).

Write the file to `{vault_path}/{filename}`.

Confirm to the user:
- The file path where the note was saved
- A brief summary of what was captured
- Tags applied for grouping

## Formatting Guidelines

Refer to `references/formatting-guide.md` for detailed Obsidian formatting conventions, callout types, and wikilink patterns.

## Example Output Structure

```markdown
---
title: API 인증 방식 논의
date: 2025-01-15
author: John Doe
tags:
  - authentication
  - api-design
  - project/my-app
aliases:
  - API 인증
  - auth 방식
summary: JWT vs OAuth2 비교 분석 및 JWT 채택 결정
category: decision
---

# API 인증 방식 논의

## 배경

[[my-app]] 프로젝트의 API 인증 방식을 결정하기 위해 논의함.

## 비교 분석

### [[JWT]]
- 무상태(stateless) 인증
- 서버 부하 적음
...

### [[OAuth2]]
- 표준 프로토콜
- 서드파티 연동 용이
...

> [!note] 결정사항
> JWT를 기본 인증 방식으로 채택. 향후 서드파티 연동 필요 시 OAuth2 추가 검토.

## 다음 단계

- [ ] JWT 라이브러리 선정
- [ ] 토큰 만료 정책 결정
- [ ] [[refresh-token]] 전략 설계
```

## Constraints

- Write notes in the same language the conversation was conducted in
- Preserve technical terms and code snippets as-is from the conversation
- Use `[[wikilink]]` liberally for concepts that could become their own notes
- Apply consistent tag conventions: use lowercase, use `/` for hierarchy (e.g., `project/my-app`)
- If the vault path doesn't exist, warn the user instead of creating it
- Use English kebab-case filenames for portability
