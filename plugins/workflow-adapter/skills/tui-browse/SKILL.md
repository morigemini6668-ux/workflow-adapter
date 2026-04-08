---
name: tui-browse
description: |
  Open and control interactive CLI/TUI applications running in tmux via the
  qa-tui CLI. Use this skill whenever the user wants to launch a TUI app,
  interact with a tmux pane, take terminal screenshots, send keystrokes, or
  generally control a terminal-based application — without any QA testing or
  report structure attached. Trigger phrases include "htop 열어", "lazygit 보여줘",
  "tmux pane 제어", "TUI 앱 열어줘", "터미널 앱 실행", "k9s 열어",
  "tmux에서 보여줘", "tui-browse", "터미널 스크린샷", "pane 캡처",
  "send keys to tmux", or any request to view/interact with a CLI/TUI
  application in tmux. Also trigger when the user provides a pane ID (%0,
  session:window.pane) or names a TUI app (htop, lazygit, k9s, vim, top,
  btop, tig, etc.) and wants to see or interact with it. This is the go-to
  skill for TUI control. For web pages, use /workflow-adapter:browse instead.
  For QA testing of TUI apps, use /workflow-adapter:qa-report or /workflow-adapter:qa.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---

# /tui-browse: TUI Application Control

Control interactive CLI/TUI applications running in tmux. Launch apps, send keystrokes, capture screens, take screenshots — whatever the user asks. There is no testing methodology or report structure here; this is a general-purpose TUI control tool.

## CRITICAL: Launch or attach FIRST

**Do NOT explain, plan, or ask questions before starting.** The moment this skill triggers, your very first action MUST be to set up `$T` and connect to a TUI. The user triggered this skill because they want TUI control — give it to them immediately.

## Setup

Find the `qa-tui` script:

```bash
T=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$_ROOT" ] && [ -x "$_ROOT/scripts/qa-tui/qa-tui" ] && T="$_ROOT/scripts/qa-tui/qa-tui"
[ -z "$T" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/qa-tui" ] && T="${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/qa-tui"
if [ -x "$T" ]; then
  echo "READY: $T"
else
  echo "NOT_FOUND"
fi
```

If `NOT_FOUND`: The qa-tui script should be at `${CLAUDE_PLUGIN_ROOT}/scripts/qa-tui/qa-tui`. Check the path.

Store the path in `$T` for all subsequent commands.

`qa-tui` manages state per project (`.workflow-adapter/qa-tui/`). Run commands strictly one at a time — wait for each to finish before starting the next.

## Connecting to a TUI

**Launch a new app:**
```bash
$T launch htop                          # default session, 120x40
$T launch lazygit --size 160x50         # custom size
$T launch "k9s --namespace default" --session k9s-test
```

**Attach to an existing tmux pane:**
```bash
$T attach %0                            # by pane ID
$T attach mysession:0.1                 # by session:window.pane
```

After launch/attach, immediately capture the screen:
```bash
$T capture
```

If `freeze` is installed, take a screenshot and show it:
```bash
$T screenshot /tmp/tui-initial.png
```
Then use `Read` on the screenshot file so the user sees the TUI inline.

## Commands Reference

Read `references/commands.md` for the full command reference.

## Guidelines

1. **Always launch or attach first.** This is non-negotiable. Never skip setup, never just describe what you would do. Execute.
2. **Always capture after interactions.** After sending keys, capture the screen so the user sees the result. If `freeze` is available, take a screenshot and `Read` it.
3. **Use named keys for navigation.** TUI apps are keyboard-driven: `Up`, `Down`, `Tab`, `Enter`, `Escape`, `C-c`, etc.
4. **Type literal text with `type`.** For search fields, input boxes, etc.
5. **Use `wait` for slow operations.** If an action triggers loading, use `$T wait <expected-text>` before capturing.
6. **Ask if unsure.** If you don't know what the user wants to do, ask — but ask AFTER launching/attaching.
7. **No QA framework.** This skill just controls TUI apps. If the user wants QA testing, suggest `/workflow-adapter:qa-report` or `/workflow-adapter:qa`.
8. **Never refuse to launch/attach.** When this skill triggers, the user wants TUI interaction — do it.
9. **Do not parallelize qa-tui commands.** Wait for each command to finish before issuing the next.
10. **Show the screen to the user.** After every capture or screenshot, either paste the text output or `Read` the screenshot file so the user sees the TUI state.
