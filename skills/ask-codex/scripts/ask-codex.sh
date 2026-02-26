#!/usr/bin/env bash
# ask-codex.sh - Send a question to Codex via the agent CLI
# Usage: ask-codex.sh <question> [--workspace <path>]
#
# Requires: agent CLI (Cursor CLI) installed and authenticated

set -euo pipefail

if ! command -v agent &>/dev/null; then
  echo "Error: 'agent' CLI (Cursor CLI) is not installed or not on PATH." >&2
  echo "Install it from Cursor, then run 'agent login' to authenticate." >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: ask-codex.sh <question> [--workspace <path>]" >&2
  exit 1
fi

QUESTION="$1"
shift

WORKSPACE_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --workspace)
      WORKSPACE_ARGS=(--workspace "$2")
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

exec agent --print \
  --model gpt-5.3-codex-high \
  --mode ask \
  "${WORKSPACE_ARGS[@]}" \
  "$QUESTION"
