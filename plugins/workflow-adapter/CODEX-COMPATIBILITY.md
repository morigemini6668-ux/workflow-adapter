# Codex Compatibility

This plugin is intentionally dual-runtime. Keep `.claude-plugin/`, Claude-specific frontmatter, and Claude tool examples in place so the Claude Code experience remains unchanged. Codex enters through the shared source skills under `skills/` and applies the mappings below when a skill mentions Claude Code tools.

## Manifest And Frontmatter

- Claude marketplace files live in `.claude-plugin/`.
- Codex marketplace files live in repo root `.agents/plugins/marketplace.json`.
- Codex plugin metadata lives in `.codex-plugin/plugin.json`.
- Shared source skill frontmatter keys such as `argument-hint`, `allowed-tools`, and `disable-model-invocation` are Claude Code metadata. Do not remove them. In Codex, treat them as descriptive hints and follow Codex host policy for actual tool use.

## Plugin Root

When a command example uses `${CLAUDE_PLUGIN_ROOT}`, resolve the plugin root in this order:

1. `${CLAUDE_PLUGIN_ROOT}` when running in Claude Code.
2. `${WORKFLOW_ADAPTER_PLUGIN_ROOT}` when the caller set it explicitly.
3. The installed Codex plugin root when available from context.
4. `plugins/workflow-adapter` when working from this repository root.

For portable shell snippets, prefer:

```bash
PLUGIN_ROOT="${WORKFLOW_ADAPTER_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-plugins/workflow-adapter}}"
```

Then call scripts as `bun "$PLUGIN_ROOT/scripts/..."`.

## Tool Mapping

| Claude Code tool or concept | Codex equivalent |
| --- | --- |
| `Bash` | `exec_command` for shell commands. Request escalation when sandbox or network access requires it. |
| `Read`, `LS`, `Glob`, `Grep` | `exec_command` with `sed`, `ls`, `rg --files`, and `rg`; prefer `rg` for search. |
| `Write`, `Edit`, `MultiEdit` | `apply_patch` for manual file edits; formatting or mechanical rewrites may use command-line tools. |
| `TodoWrite` | `update_plan` for substantial multi-step work. |
| `AskUserQuestion` | `request_user_input`. `AskUserQuestion` is a Claude Code tool and must not be called or emitted in Codex. |
| `WebSearch`, `WebFetch` | `web.search_query` and `web.open`, following Codex browsing rules. |
| Browser/TUI inspection via shell CLIs | Prefer installed Codex/browser plugin tools when explicitly requested; otherwise the existing qa scripts remain valid. |
| `Task` or `Agent` foreground delegation | `spawn_agent` followed by `wait_agent`, only when the user explicitly asked for delegation/parallel agents or the skill invocation clearly requires it. |
| `Agent(..., run_in_background: true)` | `spawn_agent` and continue local non-overlapping work; wait only when blocked. |
| `SendMessage` | `send_input` to an existing spawned Codex agent. |
| Team shutdown or cleanup | `close_agent` for spawned Codex agents. |
| `TeamCreate` / `TeamDelete` | No direct Codex equivalent. Track spawned agent ids in the conversation or workflow state files. |
| `Skill({ skill, args })` | Invoke the referenced skill instructions directly in the current turn when available. |
| `EnterWorktree` / `ExitWorktree` | Use safe git worktree shell fallbacks described in the skill, preserving uncommitted work. |

## User Input In Codex

When a workflow skill says to use `AskUserQuestion`, translate it to Codex `request_user_input` instead of writing an `AskUserQuestion(...)` call.

- Preserve the question intent, short header, and mutually exclusive options.
- Codex `request_user_input` supports one to three short questions per call. Prefer one question at a time when the workflow is collecting decisions sequentially.
- Codex automatically provides a free-form "Other" response path. If a skill requires an "Other / ask" option for `AskUserQuestion`, treat that requirement as satisfied by the Codex free-form response and do not duplicate it unless the active host explicitly requires a visible option.
- If `request_user_input` is not available in the active Codex mode, ask one concise normal chat question and wait for the user's reply.

If `request_user_input` is unavailable because the Codex `default_mode_request_user_input` feature flag is disabled or missing, recommend enabling it in `config.toml`:

```toml
[features]
default_mode_request_user_input = true
```

## Agent Files

Claude Code can register `agents/*.md` as named agent types. Codex does not discover these as agent presets from the plugin manifest. When a skill asks to spawn a workflow-adapter role in Codex:

1. Read the corresponding `agents/{role}.md` file.
2. Pass its role instructions into `spawn_agent`.
3. Tell the spawned agent that it is not alone in the codebase and must not revert changes made by others.
4. Keep write scopes disjoint when spawning multiple workers.

## Runtime State

Existing workflow state under `.workflow-adapter/` is shared by both runtimes. Claude-specific operational state under `~/.claude/` remains Claude-owned; in Codex, prefer conversation state, `.workflow-adapter/` files, or Codex app automations when the user requests follow-up behavior.
