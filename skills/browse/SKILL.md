---
name: browse
description: |
  Open and control a headless browser via the qa-browse CLI. Use this skill
  whenever the user wants to open a URL, take a screenshot, click elements,
  fill forms, or generally interact with a web page — without any QA testing
  or report structure attached. Trigger phrases include "open this page",
  "브라우저 열어", "사이트 열어줘", "페이지 열어", "스크린샷 찍어줘",
  "screenshot this URL", "browse to", "navigate to", "이 페이지 보여줘",
  "open localhost", "localhost 열어", or any request to view/interact with
  a web page. Also trigger when the user provides a URL and wants to see or
  interact with it. This is the go-to skill for browser control — use it
  even if the user doesn't explicitly say "browse".
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

# /browse: Browser Control

Control a headless Chromium browser. Open pages, click, fill forms, take screenshots — whatever the user asks. There is no testing methodology or report structure here; this is a general-purpose browser tool.

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
1. Tell the user: "qa-browse needs a one-time build (~10 seconds). OK to proceed?"
2. Run: `cd ${CLAUDE_PLUGIN_ROOT}/scripts/qa-browse && bun install && bun run build`

Store the path in `$B` for all subsequent commands.

## Opening a page

When the user gives a URL (or you detect one from context like `localhost:3000`):

```bash
$B goto <url>
$B snapshot -i -a
```

After `snapshot`, use `Read` on the screenshot file so the user sees the page inline. This is the most important feedback loop — the user wants to *see* the page.

If no URL is given, ask the user what to open.

## Core commands

### Navigation
| Command | What it does |
|---------|-------------|
| `$B goto <url>` | Navigate to URL |
| `$B back` / `$B forward` | Browser history |
| `$B reload` | Refresh the page |
| `$B url` | Print current URL |

### Viewing
| Command | What it does |
|---------|-------------|
| `$B snapshot -i -a` | Annotated snapshot with interactive element refs (@e1, @e2...) |
| `$B snapshot -i -a -o <path>` | Save snapshot to file |
| `$B screenshot <path>` | Full-page screenshot |
| `$B screenshot --viewport <path>` | Viewport-only screenshot |
| `$B screenshot --clip x,y,w,h <path>` | Clip region screenshot |
| `$B text` | Extract visible text |
| `$B links` | List all links on the page |
| `$B forms` | List all forms |

### Interaction
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

### Inspection
| Command | What it does |
|---------|-------------|
| `$B console --errors` | Show JS errors |
| `$B console` | Show all console output |
| `$B network` | Show network requests |
| `$B js "document.title"` | Execute JavaScript |
| `$B cookies` | Show cookies |
| `$B css @e1 color` | Get CSS property |
| `$B attrs @e1` | Get element attributes |

### Tabs
| Command | What it does |
|---------|-------------|
| `$B tabs` | List open tabs |
| `$B newtab <url>` | Open URL in new tab |
| `$B tab <id>` | Switch to tab |
| `$B closetab` | Close current tab |

### Auth helpers
| Command | What it does |
|---------|-------------|
| `$B cookie-import <file>` | Import cookies from JSON |
| `$B viewport <WxH>` | Set viewport size (e.g., `375x812`) |

## The @ref system

After running `snapshot -i`, elements get annotated refs like `@e1`, `@e2`, etc. Use these refs in subsequent commands instead of CSS selectors — they're more reliable and shorter.

```bash
$B snapshot -i          # see the page with refs
$B click @e3            # click the 3rd annotated element
$B fill @e7 "hello"     # fill the 7th input
```

If the page changes (navigation, AJAX), re-run `snapshot -i` to get fresh refs.

## Guidelines

1. **Always show screenshots.** After taking a snapshot or screenshot, use `Read` on the image file so the user sees it inline.
2. **Re-snapshot after interactions.** Click or form submit changes the page — take a new snapshot so the user sees the result.
3. **Use @refs over CSS selectors.** They're provided by `snapshot -i` and are simpler.
4. **Ask if unsure.** If you don't know what the user wants to do on the page, ask.
5. **No QA framework.** This skill just controls the browser. If the user wants QA testing, suggest `/workflow-adapter:qa-report` or `/workflow-adapter:qa`.
6. **Never refuse to open a page.** When this skill triggers, the user wants browser interaction — do it.
