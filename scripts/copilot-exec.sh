#!/bin/bash
# copilot-exec.sh — Copilot CLI wrapper for workflow-adapter execute skills
# Usage: copilot-exec.sh --prompt-file <path> [--model MODEL] [--timeout SECS]

set -euo pipefail

# Defaults
PROMPT_FILE=""
MODEL="gpt-5.3-codex"
TIMEOUT=600

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt-file)
      PROMPT_FILE="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROMPT_FILE" ]]; then
  echo "Error: --prompt-file is required" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# Find copilot CLI binary
find_copilot() {
  # 1. Environment variable override
  if [[ -n "${COPILOT_CLI_PATH:-}" ]] && [[ -x "$COPILOT_CLI_PATH" ]]; then
    echo "$COPILOT_CLI_PATH"
    return 0
  fi

  # 2. PATH lookup
  if command -v copilot &>/dev/null; then
    command -v copilot
    return 0
  fi

  # 3. macOS default install location
  local mac_path="$HOME/Library/Application Support/copilotCli/copilot"
  if [[ -x "$mac_path" ]]; then
    echo "$mac_path"
    return 0
  fi

  return 1
}

COPILOT_BIN=$(find_copilot) || {
  echo "Error: copilot CLI not found. Set COPILOT_CLI_PATH or install copilot CLI." >&2
  exit 127
}

# Read prompt content
PROMPT_CONTENT=$(cat "$PROMPT_FILE")

# Execute copilot with timeout (macOS-compatible background+kill pattern)
run_with_timeout() {
  "$COPILOT_BIN" -p "$PROMPT_CONTENT" \
    -s --allow-all-tools --autopilot \
    --model "$MODEL" \
    --add-dir "$(pwd)" &
  local pid=$!

  # Background timer
  (
    sleep "$TIMEOUT"
    kill "$pid" 2>/dev/null
  ) &
  local timer_pid=$!

  # Wait for copilot to finish
  if wait "$pid" 2>/dev/null; then
    local exit_code=$?
    kill "$timer_pid" 2>/dev/null || true
    wait "$timer_pid" 2>/dev/null || true
    return "$exit_code"
  else
    local exit_code=$?
    kill "$timer_pid" 2>/dev/null || true
    wait "$timer_pid" 2>/dev/null || true

    # Check if killed by timeout
    if [[ $exit_code -eq 137 ]] || [[ $exit_code -eq 143 ]]; then
      echo "Error: copilot CLI timed out after ${TIMEOUT}s" >&2
      return 124
    fi

    return "$exit_code"
  fi
}

# Run and check for auth errors
OUTPUT=$(run_with_timeout 2>&1) || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}

echo "$OUTPUT"

# Check for authentication errors in output
if echo "$OUTPUT" | grep -qi -e "auth" -e "login" -e "unauthorized" -e "not logged in"; then
  if [[ $EXIT_CODE -ne 0 ]]; then
    echo "" >&2
    echo "Hint: You may need to authenticate. Try running: copilot auth login" >&2
  fi
fi

exit "$EXIT_CODE"
