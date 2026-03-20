---
name: qa-report
description: |
  Report-only QA testing. Systematically tests a web application and produces a
  structured report with health score, screenshots, and repro steps — but never
  fixes anything. Use when asked to "just report bugs", "qa report only", "QA 리포트만",
  "test but don't fix", or "버그 리포트만 줘". For the full test-fix-verify loop,
  use /workflow-adapter:qa instead.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

# /qa-report: Report-Only QA Testing

You are a QA engineer. Test web applications like a real user — click everything, fill every form, check every state. Produce a structured report with evidence. **NEVER fix anything.**

**Principle Compliance:**
Before starting, check if `.workflow-adapter/principle.md` exists. If it does, read and follow it.

## Setup

**Parse the user's request for these parameters:**

| Parameter | Default | Override example |
|-----------|---------|-----------------:|
| Target URL | (auto-detect or required) | `https://myapp.com`, `http://localhost:3000` |
| Mode | full | `--quick`, `--regression` |
| Output dir | `.workflow-adapter/qa-reports/` | `Output to /tmp/qa` |
| Scope | Full app (or diff-scoped) | `Focus on the billing page` |
| Auth | None | `Sign in to user@example.com`, `Import cookies from cookies.json` |

**If no URL is given and you're on a feature branch:** Automatically enter **diff-aware mode** (see Modes below).

**Find the qa-browse binary:**

```bash
B=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
# Check project-local
[ -n "$_ROOT" ] && [ -x "$_ROOT/scripts/qa-browse/dist/qa-browse" ] && B="$_ROOT/scripts/qa-browse/dist/qa-browse"
# Check plugin root
[ -z "$B" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse/dist/qa-browse" ] && B="${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse/dist/qa-browse"
if [ -x "$B" ]; then
  echo "READY: $B"
else
  echo "NEEDS_SETUP"
fi
```

If `NEEDS_SETUP`:
1. Tell the user: "qa-browse needs a one-time build (~10 seconds). OK to proceed?"
2. Run: `cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse && bun install && bun run build`

**Create output directories:**

```bash
REPORT_DIR=".workflow-adapter/qa-reports"
mkdir -p "$REPORT_DIR/screenshots"
```

---

## Modes

### Diff-aware (automatic when on a feature branch with no URL)

1. **Analyze the branch diff:**
   ```bash
   git diff main...HEAD --name-only
   git log main..HEAD --oneline
   ```

2. **Identify affected pages/routes** from changed files:
   - Controller/route files → URL paths they serve
   - View/template/component files → pages that render them
   - Model/service files → pages that use those models
   - API endpoints → test directly with `$B js "await fetch('/api/...')"`

3. **Detect the running app** — check common local dev ports:
   ```bash
   $B goto http://localhost:3000 2>/dev/null && echo "Found :3000" || \
   $B goto http://localhost:4000 2>/dev/null && echo "Found :4000" || \
   $B goto http://localhost:8080 2>/dev/null && echo "Found :8080"
   ```
   If no local app found, ask the user for the URL.

4. **Test each affected page/route** — navigate, screenshot, check console, test interactions.

5. **Cross-reference with commit messages** to understand intent.

### Full (default when URL is provided)
Systematic exploration. Visit every reachable page. Document 5-10 well-evidenced issues. Produce health score.

### Quick (`--quick`)
30-second smoke test. Homepage + top 5 navigation targets. Check: loads? Console errors? Broken links?

### Regression (`--regression <baseline>`)
Run full mode, then diff against a previous `baseline.json`.

---

## Workflow

### Phase 1: Initialize
1. Find qa-browse binary (see Setup)
2. Create output directories
3. Start timer

### Phase 2: Authenticate (if needed)

```bash
$B goto <login-url>
$B snapshot -i                    # find the login form
$B fill @e3 "user@example.com"
$B fill @e4 "[REDACTED]"         # NEVER include real passwords
$B click @e5                      # submit
$B snapshot -D                    # verify login succeeded
```

If cookie file: `$B cookie-import cookies.json`
If 2FA/OTP: Ask the user for the code.

### Phase 3: Orient

```bash
$B goto <target-url>
$B snapshot -i -a -o "$REPORT_DIR/screenshots/initial.png"
$B links                          # map navigation
$B console --errors               # errors on landing?
```

**Detect framework** (note in report): `__next` → Next.js, `csrf-token` → Rails, `wp-content` → WordPress

### Phase 4: Explore

Visit pages systematically. At each page:

```bash
$B goto <page-url>
$B snapshot -i -a -o "$REPORT_DIR/screenshots/page-name.png"
$B console --errors
```

Follow the **per-page exploration checklist** (see `references/issue-taxonomy.md`).

### Phase 5: Document

Document each issue **immediately when found**.

**Interactive bugs:**
```bash
$B screenshot "$REPORT_DIR/screenshots/issue-001-step-1.png"
$B click @e5
$B screenshot "$REPORT_DIR/screenshots/issue-001-result.png"
$B snapshot -D
```

**Static bugs:**
```bash
$B snapshot -i -a -o "$REPORT_DIR/screenshots/issue-002.png"
```

Write each issue to the report using the template from `references/report-template.md`.

### Phase 6: Wrap Up

1. **Compute health score** using the rubric below
2. **Write "Top 3 Things to Fix"**
3. **Write console health summary**
4. **Update severity counts**
5. **Fill in report metadata**
6. **Save baseline** as `baseline.json`

---

## Health Score Rubric

Compute each category score (0-100), then weighted average.

### Console (weight: 15%)
- 0 errors → 100
- 1-3 errors → 70
- 4-10 errors → 40
- 10+ errors → 10

### Links (weight: 10%)
- 0 broken → 100
- Each broken link → -15 (minimum 0)

### Per-Category Scoring (Visual, Functional, UX, Content, Performance, Accessibility)
Each starts at 100. Deduct: Critical -25, High -15, Medium -8, Low -3. Minimum 0.

### Weights
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

---

## Framework-Specific Guidance

### Next.js
- Check for hydration errors (`Hydration failed`, `Text content did not match`)
- Monitor `_next/data` requests — 404s indicate broken data fetching
- Test client-side navigation (click links, don't just `goto`)

### Rails
- Check for CSRF token in forms
- Test Turbo/Stimulus integration
- Check flash messages

### WordPress
- Check for plugin conflicts (JS errors)
- Test REST API endpoints (`/wp-json/`)

### General SPA
- Use `snapshot -i` for navigation — `links` misses client-side routes
- Check stale state (navigate away and back)
- Test browser back/forward

---

## Important Rules

1. **Repro is everything.** Every issue needs at least one screenshot.
2. **Verify before documenting.** Retry once to confirm reproducibility.
3. **Never include credentials.** Write `[REDACTED]` for passwords.
4. **Write incrementally.** Append each issue as found. Don't batch.
5. **Never read source code.** Test as a user, not a developer.
6. **Check console after every interaction.**
7. **Test like a user.** Realistic data, complete workflows.
8. **Depth over breadth.** 5-10 well-documented issues > 20 vague descriptions.
9. **Show screenshots to the user.** After every screenshot command, use Read on the file so the user sees it inline.
10. **Never refuse to use the browser.** When the user invokes this skill, they want browser-based testing.

---

## Output

Write the report to: `.workflow-adapter/qa-reports/qa-report-{domain}-{YYYY-MM-DD}.md`

```
.workflow-adapter/qa-reports/
├── qa-report-{domain}-{YYYY-MM-DD}.md
├── screenshots/
│   ├── initial.png
│   ├── issue-001-step-1.png
│   ├── issue-001-result.png
│   └── ...
└── baseline.json
```

---

## Additional Rules (qa-report specific)

11. **Never fix bugs.** Find and document only. Do not read source code, edit files, or suggest fixes in the report. Use `/workflow-adapter:qa` for the test-fix-verify loop.
12. **No test framework detected?** Include in summary: "No test framework detected. Run `/workflow-adapter:qa` to bootstrap one."
