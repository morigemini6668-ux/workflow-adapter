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
  even if the user doesn't explicitly say "browse". For direct user
  invocation; agents should spawn the browser agent instead.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

# /browse: Browser Control

Control a headless Chromium browser. Open pages, click, fill forms, take screenshots — whatever the user asks. There is no testing methodology or report structure here; this is a general-purpose browser tool.

## Setup & Commands

Read `references/commands.md` for the full command reference, setup instructions, and the @ref system. Set up `$B` before doing anything else.

## Opening a page

When the user gives a URL (or you detect one from context like `localhost:3000`):

```bash
$B goto <url>
$B snapshot -i -a
```

After `snapshot`, use `Read` on the screenshot file so the user sees the page inline. This is the most important feedback loop — the user wants to *see* the page.

If no URL is given, ask the user what to open.

## Guidelines

1. **Always show screenshots.** After taking a snapshot or screenshot, use `Read` on the image file so the user sees it inline.
2. **Re-snapshot after interactions.** Click or form submit changes the page — take a new snapshot so the user sees the result.
3. **Use @refs over CSS selectors.** They're provided by `snapshot -i` and are simpler.
4. **Ask if unsure.** If you don't know what the user wants to do on the page, ask.
5. **No QA framework.** This skill just controls the browser. If the user wants QA testing, suggest `/workflow-adapter:qa-report` or `/workflow-adapter:qa`.
6. **Never refuse to open a page.** When this skill triggers, the user wants browser interaction — do it.
