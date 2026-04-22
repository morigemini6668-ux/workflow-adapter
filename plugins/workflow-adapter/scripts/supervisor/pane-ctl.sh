#!/usr/bin/env bash
# pane-ctl.sh — Control a Claude Code instance in a tmux pane.
# Uses the paste-buffer method (set-buffer + paste-buffer) instead of send-keys -l
# to avoid the Esc,Esc bug in Claude Code.
set -euo pipefail

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in

  # ── Pane Lifecycle ────────────────────────────────────────────────────

  launch)
    # Usage: pane-ctl.sh launch <cwd> <command...>
    # Splits horizontally in the current tmux window and returns pane_id.
    CWD="${1:-.}"
    shift
    FULL_CMD="$*"
    PANE_ID=$(tmux split-window -h -d -P -F '#{pane_id}' -c "$CWD" "$FULL_CMD")
    echo "$PANE_ID"
    ;;

  kill)
    # Graceful 3-step shutdown: interrupt → EOF → force
    PANE_ID="$1"
    tmux send-keys -t "$PANE_ID" C-c 2>/dev/null || true
    sleep 0.5
    if tmux list-panes -t "$PANE_ID" -F '#{pane_id}' >/dev/null 2>&1; then
      tmux send-keys -t "$PANE_ID" C-d 2>/dev/null || true
      sleep 0.5
    fi
    if tmux list-panes -t "$PANE_ID" -F '#{pane_id}' >/dev/null 2>&1; then
      tmux kill-pane -t "$PANE_ID" 2>/dev/null || true
    fi
    echo "killed"
    ;;

  # ── Text Delivery ─────────────────────────────────────────────────────

  send)
    # Paste text into pane via tmux buffer (no submit).
    PANE_ID="$1"; TEXT="$2"
    tmux set-buffer -- "$TEXT"
    tmux paste-buffer -t "$PANE_ID" -p
    ;;

  submit)
    # Press Enter once (Claude Code needs 1 press).
    PANE_ID="$1"
    tmux send-keys -t "$PANE_ID" C-m
    ;;

  send-submit)
    # Paste text + submit, with delivery verification.
    PANE_ID="$1"; TEXT="$2"
    tmux set-buffer -- "$TEXT"
    tmux paste-buffer -t "$PANE_ID" -p
    sleep 0.15
    tmux send-keys -t "$PANE_ID" C-m
    # Verify: if the first 40 chars still appear in the last 3 lines,
    # the submit didn't register — retry once.
    sleep 0.2
    PROBE="${TEXT:0:40}"
    CAPTURED=$(tmux capture-pane -p -J -t "$PANE_ID" -S -3 2>/dev/null || true)
    if echo "$CAPTURED" | grep -qF "$PROBE" 2>/dev/null; then
      tmux send-keys -t "$PANE_ID" C-m
    fi
    ;;

  # ── Capture & Detection ──────────────────────────────────────────────

  capture)
    # Capture last N lines of pane content (default 40).
    PANE_ID="$1"; LINES="${2:-40}"
    tmux capture-pane -p -J -t "$PANE_ID" -S "-$LINES"
    ;;

  state)
    # Returns: idle | busy | dead | unknown
    PANE_ID="$1"
    # Existence check
    if ! tmux list-panes -t "$PANE_ID" -F '#{pane_id}' >/dev/null 2>&1; then
      echo "dead"; exit 0
    fi
    DEAD=$(tmux list-panes -t "$PANE_ID" -F '#{pane_dead}' 2>/dev/null || echo "1")
    if [ "$DEAD" = "1" ]; then
      echo "dead"; exit 0
    fi
    OUTPUT=$(tmux capture-pane -p -J -t "$PANE_ID" -S -10 2>/dev/null || true)
    TAIL=$(echo "$OUTPUT" | awk 'NF' | tail -5)
    # Claude Code idle: prompt char ❯ or trailing >
    if echo "$TAIL" | grep -qE '❯'; then
      echo "idle"; exit 0
    fi
    # Busy: spinner chars or explicit indicators
    if echo "$TAIL" | grep -qE '⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|Thinking|Running'; then
      echo "busy"; exit 0
    fi
    echo "unknown"
    ;;

  wait-idle)
    # Block until pane goes idle. Prints periodic status lines.
    # Usage: pane-ctl.sh wait-idle <pane_id> [timeout_sec] [poll_interval_sec]
    PANE_ID="$1"
    TIMEOUT="${2:-1800}"
    POLL="${3:-5}"
    START=$(date +%s)
    while true; do
      NOW=$(date +%s)
      ELAPSED=$((NOW - START))
      if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "STATUS:timeout:${ELAPSED}s"
        exit 1
      fi
      STATE=$("$0" state "$PANE_ID")
      case "$STATE" in
        idle)   echo "STATUS:idle:${ELAPSED}s"; exit 0 ;;
        dead)   echo "STATUS:dead:${ELAPSED}s"; exit 1 ;;
        *)      ;; # busy or unknown — keep waiting
      esac
      sleep "$POLL"
    done
    ;;

  wait-file)
    # Block until a file appears. Use with Bash run_in_background for
    # event-driven phase detection instead of polling.
    # Usage: pane-ctl.sh wait-file <path> [timeout_sec]
    FILE="$1"
    TIMEOUT="${2:-1800}"
    START=$(date +%s)
    while [ ! -f "$FILE" ]; do
      NOW=$(date +%s)
      if [ $((NOW - START)) -ge "$TIMEOUT" ]; then
        echo "STATUS:timeout:${FILE}"
        exit 1
      fi
      sleep 5
    done
    echo "STATUS:found:${FILE}"
    ;;

  # ── Control ───────────────────────────────────────────────────────────

  interrupt)
    PANE_ID="$1"
    tmux send-keys -t "$PANE_ID" C-c
    ;;

  send-keys)
    # Send raw tmux key names (Enter, Tab, Up, Down, Escape, etc.)
    PANE_ID="$1"; shift
    tmux send-keys -t "$PANE_ID" "$@"
    ;;

  # ── Logging ───────────────────────────────────────────────────────────

  log-start)
    PANE_ID="$1"; LOGFILE="$2"
    mkdir -p "$(dirname "$LOGFILE")"
    tmux pipe-pane -t "$PANE_ID" -o "cat >> \"$LOGFILE\""
    echo "logging to $LOGFILE"
    ;;

  log-stop)
    PANE_ID="$1"
    tmux pipe-pane -t "$PANE_ID"
    echo "logging stopped"
    ;;

  # ── Readiness ─────────────────────────────────────────────────────────

  wait-ready)
    # Wait for a freshly launched Claude Code to show its first prompt.
    # Auto-dismisses trust/permission prompts by sending Enter.
    PANE_ID="$1"
    TIMEOUT="${2:-60}"
    START=$(date +%s)
    DELAY=1
    while true; do
      NOW=$(date +%s)
      ELAPSED=$((NOW - START))
      if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "STATUS:timeout"; exit 1
      fi
      # Check for trust prompts and dismiss
      OUTPUT=$(tmux capture-pane -p -J -t "$PANE_ID" -S -20 2>/dev/null || true)
      if echo "$OUTPUT" | grep -qiE 'Trust this project|Do you trust|press enter|Type.*to continue|bypass.*permissions'; then
        tmux send-keys -t "$PANE_ID" C-m
        sleep 1
        continue
      fi
      STATE=$("$0" state "$PANE_ID")
      if [ "$STATE" = "idle" ]; then
        echo "STATUS:ready"; exit 0
      fi
      if [ "$STATE" = "dead" ]; then
        echo "STATUS:dead"; exit 1
      fi
      sleep "$DELAY"
      DELAY=$((DELAY < 5 ? DELAY + 1 : 5))
    done
    ;;

  # ── Help ──────────────────────────────────────────────────────────────

  help)
    cat <<'HELP'
pane-ctl.sh — tmux pane controller for Claude Code instances

Lifecycle:
  launch <cwd> <cmd...>           Split pane, run command, return pane_id
  kill <pane_id>                  Graceful 3-step shutdown
  wait-ready <pane_id> [timeout]  Wait for Claude Code first prompt

Text:
  send <pane_id> <text>           Paste text (no submit)
  submit <pane_id>                Press Enter
  send-submit <pane_id> <text>    Paste + submit + verify

Capture:
  capture <pane_id> [lines]       Capture pane content (default 40)
  state <pane_id>                 idle | busy | dead | unknown
  wait-idle <pane_id> [timeout] [poll]  Block until idle

Control:
  interrupt <pane_id>             Send C-c
  send-keys <pane_id> <keys...>   Send raw tmux keys

Logging:
  log-start <pane_id> <file>      Start pipe-pane logging
  log-stop <pane_id>              Stop logging
HELP
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    "$0" help >&2
    exit 1
    ;;
esac
