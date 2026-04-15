---
name: qa-report
description: |
  Report-only QA testing. Systematically tests a web application OR interactive
  CLI/TUI application and produces a structured report with health score,
  screenshots, and repro steps — but never fixes anything.
  Use when asked to "just report bugs", "qa report only", "QA 리포트만",
  "test but don't fix", "버그 리포트만 줘", "TUI QA 리포트", "CLI 앱 테스트해줘",
  "tmux 앱 테스트", or "터미널 앱 QA". Supports both browser (web) and TUI (tmux)
  targets — auto-detects based on input. For the full test-fix-verify loop,
  use /workflow-adapter:qa instead.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

# /qa-report: Report-Only QA Testing

You are a QA engineer. Test web applications or TUI applications like a real user — click/press everything, fill every form/input, check every state. Produce a structured report with evidence. **NEVER fix anything.**

**Principle Compliance:**
Before starting, check if `.workflow-adapter/principle.md` exists. If it does, read and follow it.

## Setup

**Parse the user's request for these parameters:**

| Parameter | Default | Override example |
|-----------|---------|-----------------:|
| Target | (auto-detect or required) | URL, tmux pane ID, or TUI app name |
| Mode | full | `--quick`, `--regression`, `--tui` |
| Output dir | `.workflow-adapter/qa-reports/` | `Output to /tmp/qa` |
| Scope | Full app (or diff-scoped) | `Focus on the billing page` |
| Auth | None | `Sign in to user@example.com`, `Import cookies from cookies.json` |

### Target Type Detection

Determine the target type from the user's input:

| Input Pattern | Target Type | Tool |
|---------------|-------------|------|
| URL (`http://`, `https://`, `localhost:...`) | **Browser** | `$B` (qa-browse) |
| tmux pane ID (`%0`, `session:window.pane`) | **TUI** | `$T` (qa-tui) |
| TUI app name (`htop`, `lazygit`, `k9s`, `vim`, `btop`, `tig`, etc.) | **TUI** | `$T` (qa-tui) |
| `--tui` flag | **TUI** | `$T` (qa-tui) |
| No target + feature branch | **Browser** (diff-aware) | `$B` (qa-browse) |

Set `TARGET_TYPE=browser` or `TARGET_TYPE=tui` accordingly.

### Browser Setup (TARGET_TYPE=browser)

**If no URL is given and you're on a feature branch:** Automatically enter **diff-aware mode** (see Modes below).

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

If `NEEDS_SETUP`:
1. Tell the user: "qa-browse needs a one-time build (~10 seconds). OK to proceed?"
2. Run: `cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse && bun install && bun run build`

### TUI Setup (TARGET_TYPE=tui)

**Find the qa-tui script:**

```bash
T=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$_ROOT" ] && [ -x "$_ROOT/scripts/qa-tui/dist/qa-tui" ] && T="$_ROOT/scripts/qa-tui/dist/qa-tui"
[ -z "$T" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/dist/qa-tui" ] && T="${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/dist/qa-tui"
[ -z "$T" ] && [ -n "$_ROOT" ] && [ -x "$_ROOT/scripts/qa-tui/qa-tui" ] && T="$_ROOT/scripts/qa-tui/qa-tui"
[ -z "$T" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/qa-tui" ] && T="${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/qa-tui"
if [ -x "$T" ]; then
  echo "READY: $T"
else
  echo "NEEDS_SETUP"
fi
```

If `NEEDS_SETUP`: Build with `cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui && bun install && bun run build`

**Connect to TUI:**
- If pane ID given: `$T attach <pane-id>`
- If app name given and inside tmux: `$T launch <app-name> --here` (split current pane)
- If app name given and NOT inside tmux: `$T launch <app-name> --size 120x40` (detached session)
- Start logging: `$T log --start`

### Create output directories

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

---

## TUI Mode Workflow

When `TARGET_TYPE=tui`, follow this workflow instead of the browser workflow above.
Reference `references/tui-checklist.md` for the full per-screen checklist and issue taxonomy.

### TUI Modes

| Mode | When | What to test |
|------|------|-------------|
| **Full** (default) | App name or pane ID given | All screens, systematic per-screen checklist, resize test |
| **Quick** (`--quick`) | Smoke test needed | Main screen + 2-3 key screens. Check: renders? Responds to input? Crashes? |
| **Exhaustive** | Deep audit | Full + resize at 80x24/200x60, all edge cases, every keyboard shortcut |

Quick skips resize testing and limits exploration to the primary workflow. Exhaustive adds resize testing at multiple dimensions and exercises every documented shortcut.

### Phase 1: Initialize (TUI)
1. Find qa-tui script (see TUI Setup)
2. Create output directories
3. Start timer

### Phase 2: Connect

```bash
# Inside tmux (preferred): split current pane
$T launch <app-name> --here            # or $T attach <pane-id>
# Outside tmux: create detached session
# $T launch <app-name> --size 120x40
$T log --start                         # start continuous logging
$T capture
$T screenshot "$REPORT_DIR/screenshots/initial.png"
```

Show the initial screenshot to the user via `Read`.

### Phase 3: Orient (TUI)

```bash
$T capture                             # inspect initial state
$T size                                # record terminal dimensions
$T screenshot "$REPORT_DIR/screenshots/orient.png"
```

**Detect TUI framework** (note in report):
- `textual` classes → Textual (Python)
- `lipgloss` styling → Bubbletea (Go)
- `ratatui`/`crossterm` → Ratatui (Rust)
- ncurses-style box drawing → ncurses
- `<Box>` layout → Ink (React)

**Identify available screens**: Look for menus, tabs, help screen (`?` or `F1`), navigation hints in status bar.

### Phase 4: Explore (TUI)

Visit each screen/view systematically. At each screen:

```bash
$T press <navigation-key>             # navigate to screen
$T wait "expected header" --timeout 5  # wait for screen to load
$T capture --stable --raw             # stable capture for TUIs that repaint
$T screenshot "$REPORT_DIR/screenshots/screen-name.png"
```

Follow the **per-screen exploration checklist** from `references/tui-checklist.md`:
1. Visual scan — rendering, colors, alignment
2. Navigation — Tab, arrows, Enter, Escape, shortcuts
3. Input fields — type text, empty input, special chars
4. Data display — completeness, sorting, scrolling
5. State transitions — loading, success, failure feedback
6. Error states — invalid input, missing resources
7. Resize behavior — 80x24, 200x60, restore
8. Exit & recovery — Ctrl+C, quit, restart

### Phase 5: Document (TUI)

Document each issue **immediately when found**.

```bash
# Before the issue action
$T screenshot "$REPORT_DIR/screenshots/issue-001-before.png"
# Trigger the issue
$T press <key>
$T wait "result" --timeout 5
# After
$T screenshot "$REPORT_DIR/screenshots/issue-001-after.png"
$T diff                                # show what changed
```

Write each issue to the report using the template from `references/report-template.md`.
Use `$T capture` output for text evidence alongside screenshots.

### Phase 6: Wrap Up (TUI)

1. **Compute TUI health score** using the TUI rubric (see below)
2. **Write "Top 3 Things to Fix"**
3. **Check logs for errors**: `$T log --read --errors`
4. **Update severity counts**
5. **Fill in report metadata**
6. **Stop logging and cleanup**: `$T log --stop`
7. **Save baseline** as `baseline.json`

### TUI Health Score Rubric

| Category | Weight | What to check |
|----------|--------|---------------|
| Rendering | 20% | Broken chars, colors, box-drawing, screen redraw |
| Responsiveness | 15% | Input lag, freezes, progress feedback |
| Navigation | 20% | Screen reachability, shortcuts, focus traps |
| Input | 15% | Text input, search, validation, special chars |
| Error Handling | 10% | Crash handling, error messages, recovery |
| Layout | 10% | Alignment, overflow, resize behavior |
| Accessibility | 10% | Keyboard-only use, contrast, help availability |

Each category starts at 100. Deduct: Critical -25, High -15, Medium -8, Low -3. Minimum 0.
Final score = weighted average.

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

### TUI: Textual (Python)
- Check `--dev` mode for CSS debugging
- Test `on_mount`, `on_key` event handlers
- Verify `textual-` CSS class styling
- Check `Screen.push`/`Screen.pop` navigation

### TUI: Bubbletea (Go)
- Check `tea.Quit` and `tea.ClearScreen` handling
- Verify `lipgloss` styles render with correct colors
- Test `WindowSizeMsg` handling for resize
- Check `tea.Batch` command handling

### TUI: Ratatui (Rust)
- Set `TERM=xterm-256color` for full color support
- Check `crossterm` event handling
- Test `Terminal::draw()` rendering completeness
- Verify `Layout::split()` at various sizes

### TUI: General ncurses
- Check `SIGWINCH` (window resize) handling
- Test with `TERM=xterm` and `TERM=xterm-256color`
- Verify `initscr()`/`endwin()` cleanup on exit
- Check for cursor positioning issues

---

## Important Rules

1. **Repro is everything.** Every issue needs at least one screenshot (or text capture for TUI).
2. **Verify before documenting.** Retry once to confirm reproducibility.
3. **Never include credentials.** Write `[REDACTED]` for passwords.
4. **Write incrementally.** Append each issue as found. Don't batch.
5. **Never read source code.** Test as a user, not a developer.
6. **Check for errors after every interaction.** Browser: `$B console --errors`. TUI: `$T log --read --errors`.
7. **Test like a user.** Realistic data, complete workflows.
8. **Depth over breadth.** 5-10 well-documented issues > 20 vague descriptions.
9. **Show screenshots to the user.** After every screenshot command, use Read on the file so the user sees it inline.
10. **Never refuse to test.** When the user invokes this skill, they want testing — browser or TUI.
11. **TUI: Verify state after every input.** After every `send`, `press`, or `type`, MUST `capture` and read the result BEFORE sending the next input. Never chain inputs blindly — always observe the actual screen state.
    ```bash
    # CORRECT — verify between every input
    $T press Down
    $T capture --stable --raw        # verify: what changed?
    $T press Enter
    $T capture --stable --raw        # verify: action succeeded?

    # WRONG — blind input chain
    $T press Down
    $T press Enter
    $T capture                       # too late — you don't know what happened
    ```

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
