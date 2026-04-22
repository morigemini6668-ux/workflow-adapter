---
name: generate-claude-md
description: >
  This skill should be used when the user wants to generate, create, optimize, audit, or reduce
  a CLAUDE.md or AGENTS.md file for an AI coding agent. Trigger phrases include "generate CLAUDE.md",
  "create CLAUDE.md", "optimize CLAUDE.md", "clean up CLAUDE.md", "review my CLAUDE.md",
  "slim down CLAUDE.md", "CLAUDE.md 만들어줘", "CLAUDE.md 생성", "CLAUDE.md 최적화해줘",
  "CLAUDE.md 줄여줘", "CLAUDE.md가 너무 길어", "AGENTS.md 만들어줘", "프로젝트 컨텍스트 파일 생성".
  Applies research (arXiv:2602.11988) showing comprehensive context files reduce agent performance.
argument-hint: <optional: generate | optimize> [--yes]
---

# Generate or Optimize CLAUDE.md

Create minimal, high-impact CLAUDE.md files based on research findings that comprehensive
context files **reduce agent performance** and **increase costs by 20%+**.

**Core principle**: Include only information that, if missing, would cause concrete breakage
or wrong results. Everything else is noise that hurts performance.

For detailed research backing and authoring principles, consult `references/paper-guidelines.md`.
For the systematic analysis checklist, consult `references/analysis-checklist.md`.
For a concrete before/after optimization example, consult `examples/before-after-optimization.md`.

## Step 0: Parse Options

Check the user's argument:
- If argument contains `generate` or no argument: **generate mode** (create new CLAUDE.md)
- If argument contains `optimize`: **optimize mode** (improve existing CLAUDE.md)
- If `--yes` is present, set `auto_confirm = true` (skip final confirmation)

If a CLAUDE.md already exists and mode is `generate`, ask the user whether to overwrite or
switch to optimize mode.

## Step 1: Analyze the Codebase

Gather only the essential signals. Do NOT exhaustively explore the codebase — that defeats
the purpose of this skill.

### Quick Discovery (parallel where possible)

1. **Project identity**: Check root files (`package.json`, `Cargo.toml`, `pyproject.toml`,
   `go.mod`, `Makefile`, `docker-compose.yml`) to identify language, framework, build system
2. **Build & test commands**: Extract exact commands from package manager configs and CI files
3. **Existing docs**: Read `README.md` and `CONTRIBUTING.md` if they exist
4. **Linter configs**: Note what rules are already enforced automatically
5. **Existing CLAUDE.md/AGENTS.md**: Read if present (for optimize mode, this is the primary input)

### Constraint Detection

Scan for non-obvious patterns only:
- Import restrictions or architectural boundaries
- Non-standard naming conventions (only if they contradict language defaults)
- Required environment variables or external dependencies
- Test patterns that differ from framework defaults

**Stop criterion**: If a capable agent would discover a pattern from the code alone, exclude it.

## Step 2: Generate or Optimize

### Generate Mode

Produce a CLAUDE.md following this structure:

```markdown
# {Project Name}

{One-line description of what this project does.}

## Build & Test

{Exact shell commands — no prose, just commands with brief comments if needed}

## Key Constraints

{Only hard rules that cause breakage if violated. Bullet list, max 5-7 items.}

## Non-Obvious Patterns

{Only patterns a capable agent wouldn't discover from the code. Max 3-5 items.}
```

**Target**: 20-50 lines. Never exceed 100 lines.

**Mandatory exclusions** (do NOT include these even if found in existing docs):
- Generic best practices (SOLID, DRY, clean code)
- Rules already enforced by linter/formatter configs
- Obvious language conventions
- Git workflow or PR processes
- Exhaustive directory/file descriptions

### Optimize Mode

1. Read the existing CLAUDE.md
2. Apply the litmus test to each line: "If an agent ignores this, will something
   **concretely break**?"
3. Remove everything that fails the litmus test
4. Consolidate remaining items
5. Report the reduction (before/after line count and estimated impact)

Target: 50-70% size reduction in most cases.

## Step 3: Present Results

Display the generated/optimized CLAUDE.md content to the user.

For optimize mode, also show:
- Lines before / after
- What was removed and why (brief summary, not line-by-line)

If `auto_confirm = false`, ask the user to confirm before writing.

## Step 4: Write the File

Write the final CLAUDE.md to the project root.

Ask whether to create a backup at `CLAUDE.md.bak`, then write the final file.

## Quality Criteria

A well-crafted CLAUDE.md should satisfy ALL of these:

| Criterion | Check |
|-----------|-------|
| **Concise** | Under 50 lines (ideally), never over 100 |
| **Actionable** | Every line describes something concrete |
| **Non-obvious** | Nothing a competent agent would already know |
| **Non-redundant** | Nothing the linter/CI already enforces |
| **Specific** | Exact commands, not "run the tests" |
