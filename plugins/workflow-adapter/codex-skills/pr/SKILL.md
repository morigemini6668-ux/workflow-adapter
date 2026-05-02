---
name: pr
description: "Create a Pull Request (GitHub) or Merge Request (GitLab) with structured, concise descriptions. Use this skill when the user mentions \"PR 만들어\", \"MR 만들어\", \"풀리퀘 생성\", \"머지리퀘 생성\", \"PR 올려\", \"MR 올려\", \"create PR\", \"create MR\", \"open pull request\", \"open merge request\", \"submit PR\", \"submit MR\", \"PR 작성\", \"MR 작성\", \"코드 리뷰 요청\", \"리뷰 올려\", \"push and create PR\", \"push and create MR\", or wants to publish their branch changes for review. Also use after /workflow-adapter:execute completes and the user chooses to create a PR/MR, or when a workflow naturally reaches the review stage. Even if the user simply says \"PR\" or \"MR\" in context of completed work, trigger this skill."
---

# Pr (Codex Shim)

This is the Codex-compatible entry point for the shared workflow-adapter skill.

1. Read `../../CODEX-COMPATIBILITY.md` first.
2. Then read and follow `../../skills/pr/SKILL.md`.
3. Preserve Claude Code behavior: do not remove Claude-specific frontmatter, tool names, examples, hooks, or team semantics from the shared source skill.
4. When the source skill mentions Claude Code tools, apply the Codex tool mappings from the compatibility guide.
