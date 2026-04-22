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

Store the path in `$T` for all subsequent commands.

`qa-tui` manages state per project (`.workflow-adapter/qa-tui/`). Run commands strictly one at a time — wait for each to finish before starting the next.

## Connecting to a TUI

**Launch in current session (recommended when inside tmux):**
```bash
$T launch htop --here                   # split current pane vertically
$T launch lazygit --here --split h      # horizontal split
$T launch k9s --here --percent 60       # 60% of pane for the app
```

**Launch in a new detached session:**
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

When inside tmux, prefer `--here` so the user can see the TUI app live alongside their terminal.

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
2. **VERIFY STATE AFTER EVERY INPUT — NO EXCEPTIONS.** After every `send`, `press`, or `type` command, you MUST `capture` (or `screenshot`) and read the result BEFORE sending the next input. Never chain multiple inputs blindly. Never assume what the screen looks like — always observe.
   ```bash
   # CORRECT — verify between every input
   $T press Down
   $T capture                    # verify: what is selected now?
   $T press Down
   $T capture                    # verify: what is selected now?
   $T press Enter
   $T capture                    # verify: did the action succeed?

   # WRONG — blind input chain
   $T press Down
   $T press Down
   $T press Enter
   $T capture                    # too late — you don't know what happened
   ```
3. **Use `--stable --raw` for complex TUIs.** Apps that do full-screen repaints (Ink/React, Bubbletea, Textual) produce garbled output with plain `capture`. Use `$T capture --stable --raw` instead. If still garbled, fall back to `$T screenshot`. When unsure of the TUI framework, default to `--stable` — the minor latency cost is worth avoiding garbled output.
4. **Use named keys for navigation.** TUI apps are keyboard-driven: `Up`, `Down`, `Tab`, `Enter`, `Escape`, `C-c`, etc.
5. **Type literal text with `type`.** For search fields, input boxes, etc.
6. **Use `wait` for slow operations.** If an action triggers loading, use `$T wait <expected-text>` before capturing.
7. **Ask if unsure.** If you don't know what the user wants to do, ask — but ask AFTER launching/attaching.
8. **No QA framework.** This skill just controls TUI apps. If the user wants QA testing, suggest `/workflow-adapter:qa-report` or `/workflow-adapter:qa`.
9. **Never refuse to launch/attach.** When this skill triggers, the user wants TUI interaction — do it.
10. **Do not parallelize qa-tui commands.** Wait for each command to finish before issuing the next.
11. **Show the screen to the user.** After every capture or screenshot, either paste the text output or `Read` the screenshot file so the user sees the TUI state.
