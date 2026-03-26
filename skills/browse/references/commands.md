# qa-browse Command Reference

All commands use the `$B` variable pointing to the qa-browse binary.

## Setup

Find the `qa-browse` binary:

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
```bash
cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse && bun install && bun run build
```

Store the path in `$B` for all subsequent commands.

## Navigation

| Command | What it does |
|---------|-------------|
| `$B goto <url>` | Navigate to URL |
| `$B back` / `$B forward` | Browser history |
| `$B reload` | Refresh the page |
| `$B url` | Print current URL |

## Viewing

| Command | What it does |
|---------|-------------|
| `$B snapshot -i -a` | Annotated snapshot with interactive element refs (@e1, @e2...) |
| `$B snapshot -i -a -o <path>` | Save snapshot to specific file |
| `$B screenshot <path>` | Full-page screenshot |
| `$B screenshot --viewport <path>` | Viewport-only screenshot |
| `$B screenshot --clip x,y,w,h <path>` | Clip region screenshot |
| `$B text` | Extract visible text |
| `$B links` | List all links on the page |
| `$B forms` | List all forms |

## Interaction

| Command | What it does |
|---------|-------------|
| `$B click @e3` | Click element by ref |
| `$B fill @e4 "value"` | Fill input field |
| `$B select @e5 "option"` | Select dropdown option |
| `$B hover @e2` | Hover over element |
| `$B type "text"` | Type text (focused element) |
| `$B press Enter` | Press a key |
| `$B scroll` | Scroll down |
| `$B upload @e6 /path/to/file` | Upload file |

## Inspection

| Command | What it does |
|---------|-------------|
| `$B console --errors` | Show JS errors |
| `$B console` | Show all console output |
| `$B network` | Show network requests |
| `$B js "document.title"` | Execute JavaScript |
| `$B cookies` | Show cookies |
| `$B css @e1 color` | Get CSS property |
| `$B attrs @e1` | Get element attributes |

## Tabs

| Command | What it does |
|---------|-------------|
| `$B tabs` | List open tabs |
| `$B newtab <url>` | Open URL in new tab |
| `$B tab <id>` | Switch to tab |
| `$B closetab` | Close current tab |

## Auth helpers

| Command | What it does |
|---------|-------------|
| `$B cookie-import <file>` | Import cookies from JSON |
| `$B viewport <WxH>` | Set viewport size (e.g., `375x812`) |

## The @ref System

After running `snapshot -i`, elements get annotated refs like `@e1`, `@e2`, etc. Use these refs in subsequent commands instead of CSS selectors — they are more reliable and shorter.

```bash
$B snapshot -i          # see the page with refs
$B click @e3            # click the 3rd annotated element
$B fill @e7 "hello"     # fill the 7th input
```

If the page changes (navigation, AJAX, form submit), re-run `snapshot -i` to get fresh refs.

## Screenshot Paths

Save screenshots to `/tmp/` with descriptive names:
- Snapshots: `/tmp/browse-snapshot-<context>.png`
- Screenshots: `/tmp/browse-screenshot-<context>.png`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Command hangs or times out | `$B restart` to restart the browser server |
| Stale @refs after AJAX/navigation | Re-run `$B snapshot -i` for fresh refs |
| Server unresponsive | `$B stop`, then retry the command (auto-restarts) |
| Chromium crash | Server exits automatically; next command auto-restarts it |
| `NEEDS_SETUP` after it was working | Binary may have been cleaned; rebuild with `bun run build` |
