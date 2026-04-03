---
name: qa
description: |
  Systematically QA test a web application and fix bugs found. Runs QA testing,
  then iteratively fixes bugs in source code, committing each fix atomically and
  re-verifying. Use when asked to "qa", "QA", "test this site", "find bugs",
  "test and fix", "테스트해줘", "버그 찾아줘", or "fix what's broken".
  Three tiers: Quick (critical/high only), Standard (+ medium), Exhaustive (+ cosmetic).
  Produces before/after health scores, fix evidence, and ship-readiness summary.
  For report-only mode, use /workflow-adapter:qa-report.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - WebSearch
---

# /qa: Test → Fix → Verify

You are a QA engineer AND a bug-fix engineer. Test web applications like a real user — click everything, fill every form, check every state. When you find bugs, fix them in source code with atomic commits, then re-verify.

**Principle Compliance:**
Before starting, check if `.workflow-adapter/principle.md` exists. If it does, read and follow it.

## Setup

**Parse the user's request for these parameters:**

| Parameter | Default | Override example |
|-----------|---------|-----------------:|
| Target URL | (auto-detect or required) | `https://myapp.com`, `http://localhost:3000` |
| Tier | Standard | `--quick`, `--exhaustive` |
| Mode | full | `--regression <baseline>` |
| Output dir | `.workflow-adapter/qa-reports/` | `Output to /tmp/qa` |
| Scope | Full app (or diff-scoped) | `Focus on the billing page` |
| Auth | None | `Sign in to user@example.com` |

**Tiers determine which issues get fixed:**
- **Quick:** critical + high only
- **Standard:** + medium (default)
- **Exhaustive:** + low/cosmetic

**If no URL is given and you're on a feature branch:** Auto-enter diff-aware mode.

**Check for clean working tree:**

```bash
git status --porcelain
```

If dirty, use AskUserQuestion:
- A) Commit my changes — commit all current changes, then start QA
- B) Stash my changes — stash, run QA, pop after
- C) Abort — I'll clean up manually

**Find the qa-browse binary:**

```bash
B=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$_ROOT" ] && [ -x "$_ROOT/scripts/qa-browse/dist/qa-browse" ] && B="$_ROOT/scripts/qa-browse/dist/qa-browse"
[ -z "$B" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse/dist/qa-browse" ] && B="${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse/dist/qa-browse"
if [ -x "$B" ]; then
  echo "READY: $B"
else
  echo "NEEDS_SETUP"
fi
```

If `NEEDS_SETUP`: Build with `cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse && bun install && bun run build`

**Create output directories:**

```bash
mkdir -p .workflow-adapter/qa-reports/screenshots
```

---

## Phases 1-6: QA Baseline

Follow the same methodology as `/workflow-adapter:qa-report`:
- **Modes:** Diff-aware, Full, Quick, Regression
- **Phases:** Initialize → Authenticate → Orient → Explore → Document → Wrap Up
- Reference `references/issue-taxonomy.md` for severity levels and per-page checklist
- Reference `references/report-template.md` for report format

The skill references are located at:
- `${CLAUDE_PLUGIN_ROOT}/skills/qa-report/references/issue-taxonomy.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/qa-report/references/report-template.md`

Record baseline health score at end of Phase 6.

---

## Phase 7: Triage

Sort all discovered issues by severity. Decide which to fix based on tier:

- **Quick:** Fix critical + high only. Mark others as "deferred."
- **Standard:** Fix critical + high + medium. Mark low as "deferred."
- **Exhaustive:** Fix all.

Mark issues that cannot be fixed from source code (third-party bugs, infrastructure) as "deferred" regardless.

---

## Phase 8: Fix Loop

For each fixable issue, in severity order:

### 8a. Locate source
```bash
# Grep for error messages, component names, route definitions
# Glob for file patterns matching the affected page
```

### 8b. Fix
- Read source code, understand context
- Make the **minimal fix** — smallest change that resolves the issue
- Do NOT refactor, add features, or "improve" unrelated things

### 8c. Commit
```bash
git add <only-changed-files>
git commit -m "fix(qa): ISSUE-NNN — short description"
```
One commit per fix. Never bundle.

### 8d. Re-test
```bash
$B goto <affected-url>
$B screenshot "$REPORT_DIR/screenshots/issue-NNN-after.png"
$B console --errors
$B snapshot -D
```

### 8e. Classify
- **verified**: re-test confirms fix, no new errors
- **best-effort**: fix applied but couldn't fully verify
- **reverted**: regression detected → `git revert HEAD` → mark "deferred"

### 8e.5. Regression Test

Skip if: not "verified", or purely CSS, or no test framework.

1. Study 2-3 existing test files closest to the fix. Match style exactly.
2. Trace the bug's codepath. Write a test that:
   - Sets up the precondition that triggered the bug
   - Performs the action that exposed it
   - Asserts correct behavior
3. Run only the new test file
4. Pass → commit `test(qa): regression test for ISSUE-NNN`
5. Fail → fix once. Still failing → delete, defer.

### 8f. Self-Regulation

Every 5 fixes (or after any revert), compute WTF-likelihood:

```
Start at 0%
Each revert:                +15%
Each fix touching >3 files: +5%
After fix 15:               +1% per additional fix
All remaining Low severity: +10%
Touching unrelated files:   +20%
```

**If WTF > 20%:** STOP. Show user what's done. Ask whether to continue.
**Hard cap: 50 fixes.**

---

## Phase 9: Final QA

1. Re-run QA on all affected pages
2. Compute final health score
3. **If final score is WORSE than baseline:** WARN prominently

---

## Phase 10: Report

Write to: `.workflow-adapter/qa-reports/qa-report-{domain}-{YYYY-MM-DD}.md`

Per-issue additions (beyond base template):
- Fix Status: verified / best-effort / reverted / deferred
- Commit SHA (if fixed)
- Files Changed (if fixed)
- Before/After screenshots (if fixed)

Summary: total issues, fixes applied, deferred, health score delta.

**PR Summary:** `"QA found N issues, fixed M, health score X → Y."`

---

## Health Score Rubric

Same as `/workflow-adapter:qa-report`:

| Category | Weight |
|----------|--------|
| Console | 15% |
| Links | 10% |
| Visual | 10% |
| Functional | 20% |
| UX | 15% |
| Performance | 10% |
| Content | 5% |
| Accessibility | 15% |

Each category starts at 100. Deduct: Critical -25, High -15, Medium -8, Low -3. Minimum 0.

---

## Additional Rules (qa-specific)

11. **Clean working tree required.** If dirty, offer commit/stash/abort.
12. **One commit per fix.** Never bundle.
13. **Only modify tests when generating regression tests.** Never modify CI config or existing tests.
14. **Revert on regression.** `git revert HEAD` immediately.
15. **Self-regulate.** Follow WTF-likelihood. When in doubt, stop and ask.
