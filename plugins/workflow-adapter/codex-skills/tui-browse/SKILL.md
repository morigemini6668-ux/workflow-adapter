---
name: tui-browse
description: "Open and control interactive CLI/TUI applications running in tmux via the qa-tui CLI. Use this skill whenever the user wants to launch a TUI app, interact with a tmux pane, take terminal screenshots, send keystrokes, or generally control a terminal-based application — without any QA testing or report structure attached. Trigger phrases include \"htop 열어\", \"lazygit 보여줘\", \"tmux pane 제어\", \"TUI 앱 열어줘\", \"터미널 앱 실행\", \"k9s 열어\", \"tmux에서 보여줘\", \"tui-browse\", \"터미널 스크린샷\", \"pane 캡처\", \"send keys to tmux\", or any request to view/interact with a CLI/TUI application in tmux. Also trigger when the user provides a pane ID (%0, session:window.pane) or names a TUI app (htop, lazygit, k9s, vim, top, btop, tig, etc.) and wants to see or interact with it. This is the go-to skill for TUI control. For web pages, use /workflow-adapter:browse instead. For QA testing of TUI apps, use /workflow-adapter:qa-report or..."
---

# Tui Browse (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/tui-browse/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
