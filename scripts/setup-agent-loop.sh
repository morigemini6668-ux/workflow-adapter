#!/bin/bash

# Setup Agent Loop State File
# Creates .claude/workflow-agent-{name}.local.md for hook-based task continuation
#
# Usage: setup-agent-loop.sh <agent_name> <feature_name> [options]
#
# Options:
#   --max-iter N         Maximum iterations (default: 10)
#   --completion-signal  Signal to detect completion (default: TASKS_COMPLETE)
#   --prompt-file FILE   Read prompt from file instead of stdin
#   --system-prompt FILE Read system prompt from file

set -euo pipefail

# Validate name (agent name, feature name) - prevent path traversal and injection
validate_name() {
    local name="$1"
    local type="$2"

    if [[ -z "$name" ]]; then
        echo "Error: $type name cannot be empty" >&2
        return 1
    fi

    # Only allow lowercase letters, numbers, hyphens, and underscores
    if [[ ! "$name" =~ ^[a-z0-9_-]+$ ]]; then
        echo "Error: Invalid $type name: '$name'" >&2
        echo "Only lowercase letters, numbers, hyphens, and underscores are allowed" >&2
        return 1
    fi

    # Prevent path traversal
    if [[ "$name" == *".."* ]] || [[ "$name" == *"/"* ]] || [[ "$name" == *"\\"* ]]; then
        echo "Error: Invalid $type name: '$name' (path traversal not allowed)" >&2
        return 1
    fi

    return 0
}

# Defaults
AGENT_NAME=""
FEATURE_NAME=""
MAX_ITERATIONS=10
COMPLETION_SIGNAL="TASKS_COMPLETE"
PROMPT_FILE=""
SYSTEM_PROMPT_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-iter)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-signal)
      COMPLETION_SIGNAL="$2"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="$2"
      shift 2
      ;;
    --system-prompt)
      SYSTEM_PROMPT_FILE="$2"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$AGENT_NAME" ]]; then
        AGENT_NAME="$1"
      elif [[ -z "$FEATURE_NAME" ]]; then
        FEATURE_NAME="$1"
      else
        echo "Too many arguments" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate required arguments
if [[ -z "$AGENT_NAME" ]]; then
  echo "Error: agent_name is required" >&2
  echo "Usage: setup-agent-loop.sh <agent_name> <feature_name> [options]" >&2
  exit 1
fi

if [[ -z "$FEATURE_NAME" ]]; then
  echo "Error: feature_name is required" >&2
  echo "Usage: setup-agent-loop.sh <agent_name> <feature_name> [options]" >&2
  exit 1
fi

# Validate names (prevent path traversal and injection)
if ! validate_name "$AGENT_NAME" "agent"; then
  exit 1
fi

if ! validate_name "$FEATURE_NAME" "feature"; then
  exit 1
fi

# Ensure .claude directory exists
mkdir -p .claude

STATE_FILE=".claude/workflow-agent-${AGENT_NAME}.local.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Warn if state file already exists
if [[ -f "$STATE_FILE" ]]; then
  echo "Warning: State file already exists for agent '$AGENT_NAME'" >&2
  echo "  File: $STATE_FILE" >&2
  echo "  Overwriting..." >&2
fi

# Get prompt content
if [[ -n "$PROMPT_FILE" ]]; then
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Error: Prompt file not found: $PROMPT_FILE" >&2
    exit 1
  fi
  PROMPT_CONTENT=$(cat "$PROMPT_FILE")
else
  # Read from stdin if available, otherwise use default
  if [[ -t 0 ]]; then
    # No stdin, create default prompt
    PROMPT_CONTENT="You are the $AGENT_NAME agent. Execute your responsibilities now for feature: $FEATURE_NAME

## Your Feature
Feature: $FEATURE_NAME
Plan: .workflow-adapter/doc/feature_$FEATURE_NAME/plan.md
Context: .workflow-adapter/doc/feature_$FEATURE_NAME/context.md

## Workflow
1. Read .workflow-adapter/doc/principle.md for guidelines
2. Read .workflow-adapter/doc/feature_$FEATURE_NAME/context.md for project context
3. Read .workflow-adapter/doc/feature_$FEATURE_NAME/plan.md and find YOUR assigned tasks (look for your name: $AGENT_NAME)
4. Work on your assigned tasks and update their status in plan.md (TODO -> IN_PROGRESS -> DONE)
5. Write status messages to .workflow-adapter/doc/feature_$FEATURE_NAME/messages/ if needed
6. When done, check .workflow-adapter/doc/feature_$FEATURE_NAME/messages/ for messages addressed to you
7. If all YOUR tasks are complete and messages processed, output $COMPLETION_SIGNAL

Start working now."
  else
    PROMPT_CONTENT=$(cat)
  fi
fi

# Get system prompt if provided
SYSTEM_PROMPT=""
if [[ -n "$SYSTEM_PROMPT_FILE" ]] && [[ -f "$SYSTEM_PROMPT_FILE" ]]; then
  SYSTEM_PROMPT=$(cat "$SYSTEM_PROMPT_FILE")
fi

# Create state file with YAML frontmatter
cat > "$STATE_FILE" << EOF
---
active: true
agent_name: $AGENT_NAME
feature_name: $FEATURE_NAME
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_signal: "$COMPLETION_SIGNAL"
started_at: "$TIMESTAMP"
---

$PROMPT_CONTENT
EOF

echo "[workflow-adapter] Agent loop initialized: $AGENT_NAME"
echo "  State file: $STATE_FILE"
echo "  Feature: $FEATURE_NAME"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Completion signal: $COMPLETION_SIGNAL"
