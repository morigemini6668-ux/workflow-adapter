---
name: ask-codex
description: >
  This skill should be used when the user asks to "codex한테 물어봐", "codex에게 질문해",
  "ask codex", "codex로 확인해봐", "agent한테 물어봐", "cursor에게 질문",
  "GPT codex로 물어봐", "codex 의견 들어봐", "second opinion from codex",
  or wants to get an answer from the Codex model (GPT-5.3 Codex High) via the Cursor agent CLI.
version: 0.1.0
---

# Ask Codex

Send questions to GPT-5.3 Codex High via the `agent` CLI (Cursor CLI) and return the response.

## When to Use

- To get a second opinion or alternative perspective from the Codex model
- To obtain GPT-5.3 Codex High's analysis on a topic, code, or problem
- To cross-reference an answer with Codex's response

## How It Works

The `agent` CLI is Cursor's command-line interface. Run it in print mode with the Codex model to get non-interactive responses.

### Basic Usage

Execute the bundled script to ask a question:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ask-codex/scripts/ask-codex.sh "질문 내용"
```

Or run the `agent` command directly:

```bash
agent --print --model gpt-5.3-codex-high --mode ask "질문 내용"
```

### With Workspace Context

To give Codex access to a specific project's codebase for context-aware answers:

```bash
agent --print --model gpt-5.3-codex-high --mode ask --workspace /path/to/project "질문 내용"
```

### Workflow

1. Receive the user's question (may be in Korean or English)
2. Run the `agent` CLI with `--print --model gpt-5.3-codex-high --mode ask`
3. Capture the output
4. Present the Codex response to the user
5. If comparison is requested, present both Claude's and Codex's answers side by side with a brief synthesis of differences

### Important Notes

- The `agent` CLI must be installed and authenticated (`agent login`)
- Use `--mode ask` for read-only Q&A (no file edits)
- Use `--print` for non-interactive, scriptable output
- The model ID is `gpt-5.3-codex-high` (GPT-5.3 Codex High)
- Timeout may occur for very complex queries; consider breaking them into smaller questions

## Scripts

- **`scripts/ask-codex.sh`** - Wrapper script for sending questions to Codex. Accepts a question string and optional `--workspace` path.
