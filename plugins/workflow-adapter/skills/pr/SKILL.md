---
name: pr
description: |
  Create a Pull Request (GitHub) or Merge Request (GitLab) with structured,
  concise descriptions. Use this skill when the user mentions "PR 만들어",
  "MR 만들어", "풀리퀘 생성", "머지리퀘 생성", "PR 올려", "MR 올려",
  "create PR", "create MR", "open pull request", "open merge request",
  "submit PR", "submit MR", "PR 작성", "MR 작성", "코드 리뷰 요청",
  "리뷰 올려", "push and create PR", "push and create MR",
  or wants to publish their branch changes for review.
  Also use after /workflow-adapter:execute completes and the user chooses
  to create a PR/MR, or when a workflow naturally reaches the review stage.
  Even if the user simply says "PR" or "MR" in context of completed work,
  trigger this skill.
argument-hint: "[--base <branch>] [--draft] [--yes]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# /pr: Create Pull Request / Merge Request

You create PRs/MRs with structured, concise, bullet-point descriptions based on actual code changes. All content must be objective facts — no speculation, no filler.

---

## User Interaction Policy

- Every `AskUserQuestion` call must include `{ label: "Other / ask", description: "I want to type freely or ask a question before deciding" }`.
- When the user selects it, read their typed reply and handle accordingly.

---

## Step 0: Parse Options

Extract parameters from user arguments:

| Parameter | Default | Example |
|-----------|---------|---------|
| `--base` | auto-detect (main/master/develop) | `--base develop` |
| `--draft` | false | Create as draft PR/MR |
| `--yes` | false | Skip confirmation prompt |

```
BASE_BRANCH = --base value, or auto-detect from remote HEAD
DRAFT_MODE = true if "--draft" in $ARGUMENTS
YES_MODE = true if "--yes" in $ARGUMENTS
```

---

## Step 1: Detect Platform & CLI

Determine whether this is a GitHub or GitLab repository:

```bash
git remote get-url origin 2>/dev/null
```

- If URL contains `github.com` → use `gh` CLI
- If URL contains `gitlab` → use `glab` CLI
- If ambiguous → check which CLI is available (`gh --version` / `glab --version`)
- If neither is installed → inform user and stop

Store: `PLATFORM` (github | gitlab), `CLI` (gh | glab)

---

## Step 2: Detect PR/MR Template

Search for templates in order of precedence:

**GitHub:**
1. `.github/PULL_REQUEST_TEMPLATE.md`
2. `.github/PULL_REQUEST_TEMPLATE/` directory (list available templates)
3. `PULL_REQUEST_TEMPLATE.md` (repo root)
4. `docs/PULL_REQUEST_TEMPLATE.md`

**GitLab:**
1. `.gitlab/merge_request_templates/` directory
2. `MERGE_REQUEST_TEMPLATE.md` (repo root)

If a template exists:
- Read it and extract the section structure
- Map your content into the template's sections
- Preserve any checkboxes or required sections from the template

If no template exists:
- Use the default structure defined in Step 5

Store: `TEMPLATE_PATH` (path or null), `TEMPLATE_CONTENT` (content or null)

---

## Step 3: Gather Change Context

Run these commands to understand what changed:

```bash
# Base branch detection
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'

# Commits on this branch vs base
git log --oneline {BASE_BRANCH}..HEAD

# Full diff stat
git diff --stat {BASE_BRANCH}..HEAD

# Full diff for content analysis
git diff {BASE_BRANCH}..HEAD
```

Also check for workflow context:
```bash
# Check if this branch came from a workflow-adapter execution
ls .workflow-adapter/*/plan.md 2>/dev/null
ls .workflow-adapter/*/brainstorming.md 2>/dev/null
ls .workflow-adapter/*/spec.md 2>/dev/null
```

If workflow artifacts exist, read `plan.md` to understand the original motivation and task breakdown. This provides richer context for the PR description.

---

## Step 4: Analyze Changes

From the gathered data, extract:

1. **동기 (Motivation)**: Why was this change needed?
   - Derive from commit messages, plan.md motivation section, or brainstorming.md
   - If unclear, derive from the nature of the code changes themselves

2. **설명 (Description)**: What approach was taken?
   - Summarize the key technical decisions
   - List major file groups changed and why
   - Note any architectural or pattern changes

3. **검증 방법 (Verification)**: How can reviewers verify this works?
   - List tests added/modified
   - Note manual verification steps if applicable
   - Reference CI checks that validate the changes

4. **리뷰 포인트 (Review Focus)**: What should reviewers pay attention to?
   - Areas with highest risk or complexity
   - New patterns introduced that need consensus
   - Performance-sensitive changes
   - Security-relevant changes
   - Breaking changes or backward compatibility concerns

---

## Step 5: Compose PR/MR Content

### Title

- Under 70 characters
- Format: `type(scope): concise description`
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`
- Derive from the dominant change type across commits

### Body

If a template was found in Step 2, fill in the template's sections with the analyzed content. Map the four sections below into the template's structure as closely as possible.

If no template, use this structure:

```markdown
## 동기 (Motivation)

- {bullet point — why this change is needed}
- {bullet point — what problem it solves}

## 설명 (Description)

- {bullet point — approach taken}
- {bullet point — key technical decisions}
- {bullet point — notable patterns or architecture changes}

## 검증 방법 (Verification)

- {bullet point — tests added/modified}
- {bullet point — manual verification steps}
- {bullet point — CI checks}

## 리뷰 포인트 (Review Focus)

- {bullet point — high-risk areas}
- {bullet point — new patterns needing consensus}
- {bullet point — performance/security considerations}
```

**Writing rules:**
- 개조식 (bullet points) only — no prose paragraphs
- Every bullet is an objective, verifiable fact
- No subjective assessments ("clean", "improved readability", "better")
- No filler ("as discussed", "in order to", "this PR")
- If a section has nothing meaningful, write `- N/A` rather than fabricating content
- Use code references (`` `file:function` ``) where they add clarity

---

## Step 6: Confirm with User

If `YES_MODE` is false:

```
AskUserQuestion({
  questions: [{
    question: "PR/MR 내용을 확인해주세요:\n\n**Title:** {title}\n\n{body preview}\n\n이대로 생성할까요?",
    header: "PR/MR 확인",
    options: [
      { label: "Create", description: "이대로 PR/MR 생성" },
      { label: "Create as draft", description: "Draft로 생성" },
      { label: "Edit title", description: "제목 수정" },
      { label: "Edit body", description: "본문 수정" },
      { label: "Cancel", description: "취소" },
      { label: "Other / ask", description: "I want to type freely or ask a question before deciding" }
    ],
    multiSelect: false
  }]
})
```

Handle each option:
- **Create**: proceed to Step 7
- **Create as draft**: set `DRAFT_MODE = true`, proceed to Step 7
- **Edit title**: ask for new title, re-confirm
- **Edit body**: ask which section to change, apply edit, re-confirm
- **Cancel**: stop
- **Other / ask**: handle user's free-form input

---

## Step 7: Push & Create PR/MR

### Push branch

```bash
git push -u origin HEAD
```

If push fails (e.g., no remote, permission error), inform user and stop.

### Create PR/MR

**GitHub:**
```bash
gh pr create \
  --title "{title}" \
  --body "$(cat <<'EOF'
{body}
EOF
)" \
  --base {BASE_BRANCH} \
  {--draft if DRAFT_MODE}
```

**GitLab:**
```bash
glab mr create \
  --title "{title}" \
  --description "$(cat <<'EOF'
{body}
EOF
)" \
  --target-branch {BASE_BRANCH} \
  {--draft if DRAFT_MODE}
```

### Report result

Output the created PR/MR URL and a brief summary:

```
PR/MR created: {URL}

  Title: {title}
  Base:  {BASE_BRANCH}
  Draft: {yes/no}
```

---

## Important Rules

1. **Objective facts only** — every statement in the PR body must be verifiable from the diff or commit history
2. **Bullet points always** — never write prose paragraphs in the body
3. **Respect templates** — if the repo has a PR/MR template, use it; don't override with default structure
4. **Don't fabricate test plans** — if no tests exist, say so; don't invent verification steps
5. **Title from changes** — derive the title from actual changes, not from branch name or assumptions
6. **Review focus is critical** — this section helps reviewers prioritize; make it specific and actionable
7. **Korean section headers** — use bilingual headers (Korean with English) as shown in the default template for accessibility
