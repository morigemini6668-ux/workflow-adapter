# Codebase Analysis Checklist

Systematic extraction points for generating a minimal, effective CLAUDE.md.

## 1. Project Identity

- [ ] Primary language(s) and framework(s)
- [ ] What the project does (one line)
- [ ] Monorepo vs single project

## 2. Build & Run Commands

Extract exact commands from:

| Source | What to Look For |
|--------|-----------------|
| `package.json` | `scripts` section (build, test, dev, lint) |
| `Makefile` | Target names and common recipes |
| `Cargo.toml` | Build profile, workspace members |
| `pyproject.toml` / `setup.py` | Build system, test runner |
| `docker-compose.yml` | Service definitions, startup commands |
| `CI config` (.gitlab-ci.yml, .github/workflows/) | Build and test steps |
| `README.md` | Getting started / development sections |

**Output**: Exact shell commands, not descriptions.

## 3. Non-Obvious Constraints

Look for patterns that deviate from language/framework defaults:

| Area | What Qualifies as Non-Obvious |
|------|------------------------------|
| **Import rules** | Restricted import paths, barrel exports, circular dependency guards |
| **Naming** | Only if it contradicts language convention (e.g., snake_case in TypeScript) |
| **Architecture** | Layer boundaries that aren't enforced by the type system |
| **Testing** | Non-standard test locations, required test patterns, fixture conventions |
| **Dependencies** | Pinning requirements, banned packages, internal registry |

**Litmus test**: Would a capable agent discover this from the code alone?
If yes, don't include it.

## 4. Environment Requirements

- [ ] Language/runtime version requirements (only if non-obvious)
- [ ] Required environment variables for development
- [ ] External service dependencies (databases, queues, etc.)
- [ ] Platform-specific requirements

## 5. Existing Documentation Audit

Check these files for useful information:

- `README.md` — setup instructions, architecture overview
- `CONTRIBUTING.md` — contribution guidelines, code style
- `AGENTS.md` / `CLAUDE.md` — existing agent context
- `.editorconfig` — editor settings
- Linter configs (`.eslintrc`, `.prettierrc`, `ruff.toml`, etc.)

**Important**: If a linter config already enforces a rule, do NOT repeat it in CLAUDE.md.

## 6. What to Exclude

Cross-check generated content against these exclusion criteria:

- [ ] Generic best practices (SOLID, DRY, clean code)
- [ ] Obvious language conventions
- [ ] Rules already enforced by linter/formatter/CI
- [ ] Workflow instructions (git, PR process)
- [ ] Exhaustive directory descriptions
- [ ] Aspirational/unenforced rules
- [ ] Comprehensive API documentation
