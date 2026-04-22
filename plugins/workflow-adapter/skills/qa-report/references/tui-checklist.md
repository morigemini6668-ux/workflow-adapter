# TUI QA Checklist & Issue Taxonomy

Reference for QA testing of interactive CLI/TUI applications in tmux.

## Severity Levels

Same as web QA:

| Level | Criteria |
|-------|----------|
| **Critical** | App crashes, data loss, complete feature broken, security issue |
| **High** | Major feature unusable, wrong data displayed, navigation broken |
| **Medium** | Feature partially works, UI misalignment, unexpected behavior |
| **Low** | Cosmetic, minor UX inconvenience, edge case |

## Issue Categories (TUI-specific)

### Rendering
- Garbled/broken characters (Unicode, box-drawing, special symbols)
- Missing or corrupted ANSI colors
- Flickering or tearing during updates
- Incomplete screen redraw after operations

### Responsiveness
- Input lag or delay in key processing
- App freezes or hangs on specific actions
- No feedback during long operations (missing progress indicator)
- Unresponsive after error conditions

### Navigation
- Unreachable screens or menu items
- Keyboard shortcuts not working as documented
- Focus traps (can't navigate away from a component)
- Tab order inconsistencies
- No way to go back from a screen

### Input
- Text input not accepting characters
- Search/filter not working correctly
- Form validation missing or incorrect
- Special characters causing issues
- Paste (C-v or middle-click) not working

### Error Handling
- Unhandled exceptions shown to user (stack traces)
- Silent failures with no feedback
- Crash on invalid input
- No recovery path after errors
- Confusing or misleading error messages

### Layout
- Text overlapping or clipping
- Columns misaligned
- Content overflowing pane boundaries
- Broken layout at non-standard terminal sizes
- Status bar or header covering content

### Accessibility
- No keyboard-only navigation path
- Missing help/documentation screen
- Insufficient color contrast
- Information conveyed only by color (no text fallback)
- No clear indication of focused/selected element

## Per-Screen Exploration Checklist

At each screen/view of the TUI app:

### 1. Visual Scan
```bash
$T capture
$T screenshot "$REPORT_DIR/screenshots/screen-name.png"
```
- [ ] All text renders correctly (no garbled characters)
- [ ] Box-drawing characters and borders intact
- [ ] Colors applied consistently
- [ ] Layout elements properly aligned
- [ ] Status bar/header/footer visible and correct

### 2. Navigation
**Always capture after each input to verify state before the next.**
```bash
$T press Tab       # cycle through focusable elements
$T capture         # verify: which element has focus?
$T press Up        # menu navigation
$T capture         # verify: correct item highlighted?
$T press Down
$T capture         # verify: correct item highlighted?
$T press Enter     # activate item
$T capture         # verify: action triggered?
$T press Escape    # go back
$T capture         # verify: returned to previous screen?
```
- [ ] All menu items reachable via keyboard
- [ ] Tab cycles through interactive elements
- [ ] Enter activates the selected item
- [ ] Escape/q/back returns to previous screen
- [ ] Keyboard shortcuts listed in help work

### 3. Input Fields
**Always capture after each input to verify state before the next.**
```bash
$T press /         # open search (common pattern)
$T capture         # verify: search field opened?
$T type "test input"
$T capture         # verify: text entered correctly?
$T press Enter
$T capture         # verify: search results shown?
```
- [ ] Text fields accept input
- [ ] Backspace/delete works
- [ ] Empty input handled gracefully
- [ ] Special characters (Unicode, quotes, spaces) handled
- [ ] Long input doesn't break layout

### 4. Data Display
```bash
$T capture
```
- [ ] Data renders completely (no truncation without indicator)
- [ ] Sorting/filtering works correctly
- [ ] Pagination or scrolling works
- [ ] Empty state shown when no data

### 5. State Transitions
```bash
$T press Enter     # trigger action
$T wait "expected text" --timeout 10
$T capture
```
- [ ] Loading states shown during operations
- [ ] Success/failure feedback provided
- [ ] Screen updates after data changes
- [ ] No stale data displayed

### 6. Error States
```bash
$T type "nonexistent-resource"
$T capture         # verify: text entered?
$T press Enter
$T capture         # verify: error message shown?
```
- [ ] Invalid input shows meaningful error
- [ ] Error messages are actionable
- [ ] App recovers from errors (doesn't crash or freeze)
- [ ] Can dismiss errors and continue

### 7. Resize Behavior
```bash
$T resize 80x24    # small terminal
$T capture
$T screenshot "$REPORT_DIR/screenshots/screen-small.png"
$T resize 200x60   # large terminal
$T capture
$T screenshot "$REPORT_DIR/screenshots/screen-large.png"
$T resize 120x40   # restore default
```
- [ ] Content reflows at smaller size
- [ ] No overlapping or clipped text
- [ ] Scrollable areas adjust
- [ ] UI usable at 80x24 minimum

### 8. Exit & Recovery
```bash
$T send C-c        # interrupt
$T capture         # verify: interrupt handled gracefully?
$T press q         # quit
$T capture         # verify: app exited or confirm prompt?
```
- [ ] Ctrl+C handled gracefully (not raw crash)
- [ ] Quit command works
- [ ] Confirmation prompt for destructive actions
- [ ] App state preserved on restart (if applicable)

## TUI Health Score

| Category | Weight | Deductions |
|----------|--------|-----------|
| Rendering | 20% | Critical -25, High -15, Medium -8, Low -3 |
| Responsiveness | 15% | Critical -25, High -15, Medium -8, Low -3 |
| Navigation | 20% | Critical -25, High -15, Medium -8, Low -3 |
| Input | 15% | Critical -25, High -15, Medium -8, Low -3 |
| Error Handling | 10% | Critical -25, High -15, Medium -8, Low -3 |
| Layout | 10% | Critical -25, High -15, Medium -8, Low -3 |
| Accessibility | 10% | Critical -25, High -15, Medium -8, Low -3 |

Each category starts at 100. Apply deductions per issue. Minimum 0.
Final score = weighted average of all categories.

## Common TUI Frameworks & Testing Notes

| Framework | Language | Key Patterns |
|-----------|----------|-------------|
| **ncurses** | C/C++ | Low-level, raw key handling, `SIGWINCH` for resize |
| **Textual** | Python | Rich widget system, `textual run --dev` for dev mode |
| **Bubbletea** | Go | Elm architecture, `tea.Msg` based updates |
| **Ratatui** | Rust | Immediate mode rendering, `crossterm` backend |
| **Ink** | JS/React | React-like components, `<Box>` layout |
| **blessed** | JS | ncurses-like for Node.js |
| **tview** | Go | Terminal UI primitives, form widgets |

### Framework-Specific Checks

**Textual apps**: Look for `textual-` CSS classes in output. Check `--dev` mode for CSS inspector. Verify `on_*` event handlers work.

**Bubbletea apps**: Check `tea.Quit` handling. Verify `Init()` → `Update()` → `View()` cycle. Look for `lipgloss` styling issues.

**Ratatui apps**: Check `Terminal::draw()` rendering. Verify `crossterm` event handling. Test with `TERM=xterm-256color`.
