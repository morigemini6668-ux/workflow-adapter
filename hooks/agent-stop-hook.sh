#!/bin/bash

# Workflow Adapter Agent Stop Hook
# Continues agent/orchestrator execution until completion signal or max iterations
# Supports multiple agents with individual state files
# Also supports orchestrator with its own state file

set -euo pipefail

# Read hook input from stdin (advanced stop hook API)
HOOK_INPUT=$(cat)

STATE_DIR=".claude"
ORCHESTRATOR_STATE_FILE="$STATE_DIR/workflow-orchestrator.local.md"
AGENT_STATE_PATTERN="workflow-agent-*.local.md"

# ============================================
# ORCHESTRATOR HANDLING (priority)
# ============================================

if [[ -f "$ORCHESTRATOR_STATE_FILE" ]]; then
  # Parse orchestrator state file
  FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$ORCHESTRATOR_STATE_FILE")
  FEATURE_NAME=$(echo "$FRONTMATTER" | grep '^feature_name:' | sed 's/feature_name: *//')
  ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
  MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
  COMPLETION_SIGNAL=$(echo "$FRONTMATTER" | grep '^completion_signal:' | sed 's/completion_signal: *//' | sed 's/^"\(.*\)"$/\1/')

  # Validate numeric fields
  if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
    echo "Warning: Orchestrator state file corrupted (iteration: '$ITERATION')" >&2
    rm "$ORCHESTRATOR_STATE_FILE"
    exit 0
  fi

  if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
    echo "Warning: Orchestrator state file corrupted (max_iterations: '$MAX_ITERATIONS')" >&2
    rm "$ORCHESTRATOR_STATE_FILE"
    exit 0
  fi

  # Check if max iterations reached
  if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
    echo "[workflow-adapter] Orchestrator: Max iterations ($MAX_ITERATIONS) reached."
    rm "$ORCHESTRATOR_STATE_FILE"
    exit 0
  fi

  # Get transcript path from hook input
  TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

  if [[ -f "$TRANSCRIPT_PATH" ]] && grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
    LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
    LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
      .message.content |
      map(select(.type == "text")) |
      map(.text) |
      join("\n")
    ' 2>/dev/null || echo "")

    # Check for WORKFLOW_COMPLETE signal
    SIGNAL="${COMPLETION_SIGNAL:-WORKFLOW_COMPLETE}"
    if echo "$LAST_OUTPUT" | grep -q "$SIGNAL"; then
      echo "[workflow-adapter] Orchestrator: Workflow complete ($SIGNAL detected)"
      rm "$ORCHESTRATOR_STATE_FILE"
      exit 0
    fi
  fi

  # Not complete - continue orchestrator loop
  NEXT_ITERATION=$((ITERATION + 1))

  # Extract prompt (everything after the closing ---)
  PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$ORCHESTRATOR_STATE_FILE")

  if [[ -z "$PROMPT_TEXT" ]]; then
    echo "Warning: No prompt found in orchestrator state file" >&2
    rm "$ORCHESTRATOR_STATE_FILE"
    exit 0
  fi

  # Update iteration in frontmatter
  TEMP_FILE="${ORCHESTRATOR_STATE_FILE}.tmp.$$"
  sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$ORCHESTRATOR_STATE_FILE" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$ORCHESTRATOR_STATE_FILE"

  # Build system message
  SYSTEM_MSG="[workflow-adapter] Orchestrator iteration $NEXT_ITERATION/$MAX_ITERATIONS | Feature: $FEATURE_NAME | Output 'WORKFLOW_COMPLETE' when all tasks done"

  # Output JSON to block the stop and feed prompt back
  jq -n \
    --arg prompt "$PROMPT_TEXT" \
    --arg msg "$SYSTEM_MSG" \
    '{
      "decision": "block",
      "reason": $prompt,
      "systemMessage": $msg
    }'
  exit 0
fi

# ============================================
# AGENT HANDLING (if no orchestrator)
# ============================================

# Check if any agent state files exist
shopt -s nullglob
STATE_FILES=("$STATE_DIR"/$AGENT_STATE_PATTERN)
shopt -u nullglob

if [[ ${#STATE_FILES[@]} -eq 0 ]]; then
  # No active agents - allow exit
  exit 0
fi

# Sort files to ensure consistent order (alpha, beta, gamma...)
IFS=$'\n' SORTED_FILES=($(sort <<<"${STATE_FILES[*]}"))
unset IFS

# Get the first active agent file
AGENT_STATE_FILE="${SORTED_FILES[0]}"

if [[ ! -f "$AGENT_STATE_FILE" ]]; then
  # File was removed between check and read - allow exit
  exit 0
fi

# Parse markdown frontmatter (YAML between ---) and extract values
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$AGENT_STATE_FILE")
AGENT_NAME=$(echo "$FRONTMATTER" | grep '^agent_name:' | sed 's/agent_name: *//')
FEATURE_NAME=$(echo "$FRONTMATTER" | grep '^feature_name:' | sed 's/feature_name: *//')
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
COMPLETION_SIGNAL=$(echo "$FRONTMATTER" | grep '^completion_signal:' | sed 's/completion_signal: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "Warning: Agent state file corrupted (iteration: '$ITERATION')" >&2
  echo "Removing corrupted state file: $AGENT_STATE_FILE" >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Warning: Agent state file corrupted (max_iterations: '$MAX_ITERATIONS')" >&2
  echo "Removing corrupted state file: $AGENT_STATE_FILE" >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

# Check if max iterations reached
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "[workflow-adapter] Agent '$AGENT_NAME': Max iterations ($MAX_ITERATIONS) reached."
  rm "$AGENT_STATE_FILE"

  # Check if there are more agents
  shopt -s nullglob
  REMAINING_FILES=("$STATE_DIR"/$AGENT_STATE_PATTERN)
  shopt -u nullglob

  if [[ ${#REMAINING_FILES[@]} -eq 0 ]]; then
    echo "[workflow-adapter] All agents completed."
    exit 0
  fi

  # Continue with next agent
  NEXT_FILE="${REMAINING_FILES[0]}"
  NEXT_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$NEXT_FILE")
  NEXT_AGENT=$(echo "$NEXT_FRONTMATTER" | grep '^agent_name:' | sed 's/agent_name: *//')
  NEXT_PROMPT=$(awk '/^---$/{i++; next} i>=2' "$NEXT_FILE")

  jq -n \
    --arg prompt "$NEXT_PROMPT" \
    --arg msg "[workflow-adapter] Starting agent '$NEXT_AGENT' (iteration 1)" \
    '{
      "decision": "block",
      "reason": $prompt,
      "systemMessage": $msg
    }'
  exit 0
fi

# Get transcript path from hook input
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "Warning: Transcript file not found: $TRANSCRIPT_PATH" >&2
  echo "Stopping agent loop." >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

# Read last assistant message from transcript
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  echo "Warning: No assistant messages in transcript" >&2
  echo "Stopping agent loop." >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
if [[ -z "$LAST_LINE" ]]; then
  echo "Warning: Failed to extract last assistant message" >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
' 2>&1)

if [[ $? -ne 0 ]] || [[ -z "$LAST_OUTPUT" ]]; then
  echo "Warning: Failed to parse assistant message" >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

# Check for completion signal (TASKS_COMPLETE, REVIEW_COMPLETE, WORKFLOW_COMPLETE)
SIGNAL="${COMPLETION_SIGNAL:-TASKS_COMPLETE}"
if echo "$LAST_OUTPUT" | grep -q "$SIGNAL"; then
  echo "[workflow-adapter] Agent '$AGENT_NAME': Completed ($SIGNAL detected)"
  rm "$AGENT_STATE_FILE"

  # Check if there are more agents
  shopt -s nullglob
  REMAINING_FILES=("$STATE_DIR"/$AGENT_STATE_PATTERN)
  shopt -u nullglob

  if [[ ${#REMAINING_FILES[@]} -eq 0 ]]; then
    echo "[workflow-adapter] All agents completed."
    exit 0
  fi

  # Sort remaining files and get next agent
  IFS=$'\n' SORTED_REMAINING=($(sort <<<"${REMAINING_FILES[*]}"))
  unset IFS

  NEXT_FILE="${SORTED_REMAINING[0]}"
  NEXT_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$NEXT_FILE")
  NEXT_AGENT=$(echo "$NEXT_FRONTMATTER" | grep '^agent_name:' | sed 's/agent_name: *//')
  NEXT_PROMPT=$(awk '/^---$/{i++; next} i>=2' "$NEXT_FILE")

  jq -n \
    --arg prompt "$NEXT_PROMPT" \
    --arg msg "[workflow-adapter] Starting agent '$NEXT_AGENT' (iteration 1)" \
    '{
      "decision": "block",
      "reason": $prompt,
      "systemMessage": $msg
    }'
  exit 0
fi

# Check for critical errors
if echo "$LAST_OUTPUT" | grep -qi "CRITICAL_ERROR\|FATAL_ERROR"; then
  echo "[workflow-adapter] Agent '$AGENT_NAME': Critical error detected. Stopping."
  rm "$AGENT_STATE_FILE"
  exit 0
fi

# Not complete - continue loop with same prompt
NEXT_ITERATION=$((ITERATION + 1))

# Extract prompt (everything after the closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "Warning: No prompt found in state file" >&2
  rm "$AGENT_STATE_FILE"
  exit 0
fi

# Update iteration in frontmatter
TEMP_FILE="${AGENT_STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$AGENT_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$AGENT_STATE_FILE"

# Build system message
SYSTEM_MSG="[workflow-adapter] Agent '$AGENT_NAME' iteration $NEXT_ITERATION/$MAX_ITERATIONS | Feature: $FEATURE_NAME | Output '$SIGNAL' when all tasks complete"

# Output JSON to block the stop and feed prompt back
jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
