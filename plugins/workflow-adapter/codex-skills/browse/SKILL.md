---
name: browse
description: "Open and control a headless browser via the qa-browse CLI. Use this skill whenever the user wants to open a URL, take a screenshot, click elements, fill forms, or generally interact with a web page — without any QA testing or report structure attached. Trigger phrases include \"open this page\", \"브라우저 열어\", \"사이트 열어줘\", \"페이지 열어\", \"스크린샷 찍어줘\", \"screenshot this URL\", \"browse to\", \"navigate to\", \"이 페이지 보여줘\", \"open localhost\", \"localhost 열어\", or any request to view/interact with a web page. Also trigger when the user provides a URL and wants to see or interact with it. This is the go-to skill for browser control — use it even if the user doesn't explicitly say \"browse\". For direct user invocation; agents should spawn the browser agent instead."
---

# Browse (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/browse/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
