# Research-Backed Guidelines for CLAUDE.md / AGENTS.md

Based on: "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"
(Gloaguen et al., 2026, arXiv:2602.11988)

## Key Findings

### Context Files Can Hurt Performance

- Agents receiving context files showed **lower task success rates** than agents with no context
- Inference costs increased by **over 20%** when using context files
- Both AI-generated and human-written context files triggered broader exploration patterns
  (more testing, extensive file traversal) that distracted from core tasks

### Why Comprehensive Guidance Backfires

1. **Unnecessary requirements make tasks harder** — agents spend effort following rules
   that don't apply to the current task
2. **Broad exploration is induced** — agents feel compelled to check more files, run more
   tests, and follow more procedures than necessary
3. **Token budget is wasted** — reading and processing long context files consumes tokens
   that could be used for actual problem-solving
4. **Focus is diluted** — instead of zeroing in on the problem, agents try to satisfy
   all the guidelines simultaneously

## Authoring Principles

### DO Include (Essential Information Only)

- **Build commands**: How to build, test, and run the project (exact commands)
- **Critical conventions**: Only non-obvious conventions that differ from language defaults
  (e.g., "use tabs not spaces" in a Python project where spaces are the norm)
- **Architectural constraints**: Hard rules that, if violated, break things
  (e.g., "never import from internal/ outside of core/")
- **Environment setup**: Non-obvious environment requirements
  (e.g., "requires Node 20+", "needs Docker for integration tests")

### DO NOT Include

- **Obvious conventions**: Things any competent developer or AI would already know
  (e.g., "use meaningful variable names", "write tests for new features")
- **Comprehensive style guides**: The linter/formatter config already enforces style
- **Generic best practices**: SOLID principles, DRY, error handling patterns
- **Exhaustive file descriptions**: The codebase structure is self-documenting
- **Workflow instructions**: How to use git, how to create PRs
- **Aspirational rules**: Things the team wants to do but doesn't enforce

### The Litmus Test

For each line in CLAUDE.md, ask:

> "If an agent ignores this line, will something **concretely break** or produce
> a **wrong result**?"

If the answer is no, remove it.

## Optimal Structure

### Target Size

- **Ideal**: 20-50 lines (500-1500 characters)
- **Maximum**: 100 lines before diminishing returns
- **Red flag**: Over 200 lines — almost certainly contains unnecessary content

### Recommended Sections

```markdown
# Project Name

Brief one-line description of what this project does.

## Build & Test

exact commands to build and test

## Key Constraints

only hard rules that would cause breakage if violated

## Non-Obvious Patterns

only patterns a capable agent wouldn't discover on its own
```

### Anti-Patterns to Avoid

- Long lists of "coding standards" (the linter handles this)
- Sections explaining obvious architecture (the code explains itself)
- Instructions on how to use basic tools (git, npm, etc.)
- Comprehensive API documentation (lives in actual docs)
- Team processes and workflows (not relevant to coding tasks)

## Optimization Strategy for Existing Files

When optimizing an existing CLAUDE.md:

1. **Measure**: Count current lines and estimate word count
2. **Classify each section**: Essential (keeps things from breaking) vs Nice-to-have
3. **Remove nice-to-haves**: Delete anything that doesn't pass the litmus test
4. **Consolidate**: Merge related essential items
5. **Verify**: Ensure remaining content is actionable and specific
6. **Target**: Aim for 50-70% reduction in most cases
