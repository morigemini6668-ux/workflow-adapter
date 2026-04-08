# qa-tui Command Reference

All commands use the `$T` variable pointing to the qa-tui script.

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

Store the path in `$T` for all subsequent commands.

Important: `qa-tui` manages a single TUI session per project. Do not run two `$T` commands in parallel. Always wait for one command to finish before starting the next.

## Connection

| Command | What it does |
|---------|-------------|
| `$T launch <cmd> --here [--split h\|v] [--percent N]` | Split current pane and run app there |
| `$T launch <cmd> [--session S] [--size WxH]` | Start app in new detached tmux session |
| `$T attach <pane-id>` | Connect to existing tmux pane |
| `$T status` | Check if pane is alive, show dimensions and running command |
| `$T stop` | Kill the managed pane (here mode) or session (detached mode) |

### Launch — here mode (recommended inside tmux)

Splits the current pane and launches the app there. The user can see the TUI live.

```bash
$T launch htop --here                             # vertical split (default)
$T launch lazygit --here --split h                # horizontal split
$T launch k9s --here --split v --percent 60       # 60% of pane for the app
$T launch "python -m textual run my_app.py" --here
```

| Flag | Default | Description |
|------|---------|-------------|
| `--here` | — | Required. Enables split mode instead of new session |
| `--split` | `v` | Split direction: `v` (vertical) or `h` (horizontal) |
| `--percent` | — | Split size as percentage of current pane |

Requires running inside tmux (`$TMUX` must be set).

### Launch — detached mode

Creates a new detached tmux session. Use when not inside tmux or when you want isolation.

```bash
$T launch htop                                    # defaults: session=qa-tui-$$, 120x40
$T launch lazygit --size 160x50                   # custom terminal size
$T launch "k9s --namespace kube-system" --session k9s
```

### Attach examples

```bash
$T attach %0                    # pane ID (permanent)
$T attach mysession:0.1         # session:window.pane
```

To list available panes:
```bash
tmux list-panes -a -F '#{pane_id} #{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'
```

## Viewing

| Command | What it does |
|---------|-------------|
| `$T capture` | Plain text capture of visible pane |
| `$T capture --ansi` | Capture with ANSI colors/formatting |
| `$T capture --history` | Include full scrollback history |
| `$T capture --history -n 50` | Include last 50 lines of scrollback |
| `$T screenshot <path>` | Capture as image (freeze) / HTML (aha) / text |
| `$T size` | Print pane dimensions (WxH) |
| `$T diff` | Unified diff against previous capture |

### Screenshot pipeline

The screenshot command uses the best available tool:

| Tool | Install | Output |
|------|---------|--------|
| `freeze` | `brew install charmbracelet/tap/freeze` | PNG image (best) |
| `aha` | `brew install aha` | HTML with colors |
| (none) | — | Plain text fallback |

## Interaction

| Command | What it does |
|---------|-------------|
| `$T send <keys...>` | Send named keys (can chain multiple) |
| `$T type <text>` | Send literal text (no key interpretation) |
| `$T press <key>` | Send single named key |
| `$T search <pattern>` | Search screen for text (returns matching lines with line numbers) |
| `$T wait <pattern> [--timeout N]` | Wait for text to appear (default 10s) |
| `$T resize <WxH>` | Resize pane |

### Key names

Named keys for `send` and `press`:

| Key | Name |
|-----|------|
| Enter | `Enter` |
| Escape | `Escape` |
| Tab | `Tab` |
| Shift+Tab | `BTab` |
| Space | `Space` |
| Backspace | `BSpace` |
| Delete | `DC` |
| Arrow keys | `Up`, `Down`, `Left`, `Right` |
| Page Up/Down | `PPage`, `NPage` |
| Home/End | `Home`, `End` |
| Function keys | `F1` - `F12` |

### Modifier prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| `C-` | Ctrl | `C-c` (interrupt), `C-d` (EOF), `C-z` (suspend) |
| `S-` | Shift | `S-Up` |
| `M-` | Alt/Meta | `M-x` |

### Common interaction patterns

```bash
# Navigate a menu
$T press Down
$T press Down
$T press Enter

# Type in a search field
$T press /                    # open search in many TUIs
$T type "search term"
$T press Enter

# Interrupt a running process
$T send C-c

# Send Ctrl+Z to suspend
$T send C-z

# Clear input line
$T send C-u

# Navigate with Ctrl+arrow
$T send C-Right

# Quit most TUIs
$T press q
```

## Logging

| Command | What it does |
|---------|-------------|
| `$T log --start` | Start continuous output logging to session.log |
| `$T log --stop` | Stop logging |
| `$T log --read` | Read the full log |
| `$T log --read --errors` | Filter log for errors/failures only |

Logging captures all pane output in real-time via `tmux pipe-pane`. Useful for catching transient errors or monitoring background activity.

## State management

qa-tui stores state in `.workflow-adapter/qa-tui/`:

```
.workflow-adapter/qa-tui/
├── state.json          # Active session/pane info
├── previous.txt        # Last plain-text capture (for diff)
├── session.log         # Continuous log output
└── screenshots/        # Screenshot output directory
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No active pane" | Run `$T launch <cmd>` or `$T attach <pane>` first |
| Pane shows "dead" | The TUI app exited. Check `$T capture --history` for errors, then `$T launch` again |
| Keys not working | Some TUI apps need specific key sequences. Try `$T send -l` for literal text or check the app's keybindings |
| Garbled output | Resize to standard dimensions: `$T resize 120x40` |
| Screenshot is text only | Install freeze: `brew install charmbracelet/tap/freeze` |
| Wait times out | Increase timeout: `$T wait "pattern" --timeout 30` |
