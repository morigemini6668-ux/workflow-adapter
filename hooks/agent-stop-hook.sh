#!/bin/bash

# Workflow Adapter Agent Stop Hook
# Continues agent execution until completion signal or max iterations
# Supports multiple agents with individual state files

# Don't use set -e as it causes silent failures in hooks
set -uo pipefail

# Read hook input from stdin (advanced stop hook API)
HOOK_INPUT=$(cat)

STATE_DIR=".claude"
AGENT_STATE_PATTERN="workflow-agent-*.local.md"

# ============================================
# AGENT HANDLING
# ============================================

# Check if .claude directory exists
if [[ ! -d "$STATE_DIR" ]]; then
  exit 0
fi

# Check if any agent state files exist
shopt -s nullglob
STATE_FILES=("$STATE_DIR"/$AGENT_STATE_PATTERN)
shopt -u nullglob

if [[ ${#STATE_FILES[@]} -eq 0 ]]; then
  # No active agents - allow exit
  exit 0
fi

# Sort files to ensure consistent order (alpha, beta, gamma...)
if [[ ${#STATE_FILES[@]} -gt 1 ]]; then
  IFS=$'\n' SORTED_FILES=($(printf '%s\n' "${STATE_FILES[@]}" | sort))
  unset IFS
else
  SORTED_FILES=("${STATE_FILES[@]}")
fi

# Get transcript path from hook input first (needed for session matching)
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path' 2>/dev/null) || TRANSCRIPT_PATH=""

# Find state file that matches current session (by transcript_path)
# Only handle state files that belong to THIS session to prevent cross-session interference
AGENT_STATE_FILE=""
for STATE_FILE in "${SORTED_FILES[@]}"; do
  if [[ ! -f "$STATE_FILE" ]]; then
    continue
  fi

  # Parse frontmatter to check session binding
  FILE_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
  FILE_TRANSCRIPT=$(echo "$FILE_FRONTMATTER" | grep '^transcript_path:' | sed 's/transcript_path: *//' | sed 's/^"\(.*\)"$/\1/')
  FILE_AGENT=$(echo "$FILE_FRONTMATTER" | grep '^agent_name:' | sed 's/agent_name: *//')
  FILE_FEATURE=$(echo "$FILE_FRONTMATTER" | grep '^feature_name:' | sed 's/feature_name: *//')

  if [[ -z "$FILE_TRANSCRIPT" ]]; then
    # Unclaimed state file - check if this session started it by looking at transcript
    if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
      # Check if transcript mentions this agent's feature (indicates this session started it)
      if grep -q "feature.*$FILE_FEATURE\|$FILE_FEATURE.*feature\|workflow-agent-$FILE_AGENT\|:$FILE_AGENT\b" "$TRANSCRIPT_PATH" 2>/dev/null; then
        # This session likely started this agent - claim it
        TEMP_FILE="${STATE_FILE}.tmp.$$"
        sed "s/^started_at:/transcript_path: \"$TRANSCRIPT_PATH\"\nstarted_at:/" "$STATE_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$STATE_FILE"
        AGENT_STATE_FILE="$STATE_FILE"
        break
      fi
    fi
    # Doesn't seem to belong to this session - skip
    continue
  elif [[ "$FILE_TRANSCRIPT" == "$TRANSCRIPT_PATH" ]]; then
    # This state file belongs to current session
    AGENT_STATE_FILE="$STATE_FILE"
    break
  fi
  # If transcript doesn't match, skip (belongs to another session)
done

if [[ -z "$AGENT_STATE_FILE" ]] || [[ ! -f "$AGENT_STATE_FILE" ]]; then
  # No matching state file for this session - allow exit
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
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Warning: Agent state file corrupted (max_iterations: '$MAX_ITERATIONS')" >&2
  echo "Removing corrupted state file: $AGENT_STATE_FILE" >&2
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

# Check if max iterations reached
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "[workflow-adapter] Agent '$AGENT_NAME': Max iterations ($MAX_ITERATIONS) reached."
  rm -f "$AGENT_STATE_FILE"

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

# Verify transcript file exists (TRANSCRIPT_PATH was already read above)
if [[ -z "$TRANSCRIPT_PATH" ]] || [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "Warning: Transcript file not found: $TRANSCRIPT_PATH" >&2
  echo "Stopping agent loop." >&2
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

# Read last assistant message from transcript
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  echo "Warning: No assistant messages in transcript" >&2
  echo "Stopping agent loop." >&2
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
if [[ -z "$LAST_LINE" ]]; then
  echo "Warning: Failed to extract last assistant message" >&2
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
' 2>/dev/null) || LAST_OUTPUT=""

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "Warning: Failed to parse assistant message or empty output" >&2
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

# Check for WAITING_FOR_DEPENDENCY signal (should retry after delay)
if echo "$LAST_OUTPUT" | grep -q "WAITING_FOR_DEPENDENCY"; then
  echo "[workflow-adapter] Agent '$AGENT_NAME': Waiting for dependency (will retry)"

  # Continue with retry - don't increment iteration count heavily
  NEXT_ITERATION=$((ITERATION + 1))

  # Extract prompt
  PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_STATE_FILE")

  if [[ -z "$PROMPT_TEXT" ]]; then
    echo "Warning: No prompt found in state file" >&2
    rm -f "$AGENT_STATE_FILE"
    exit 0
  fi

  # Update iteration
  TEMP_FILE="${AGENT_STATE_FILE}.tmp.$$"
  sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$AGENT_STATE_FILE" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$AGENT_STATE_FILE"

  SYSTEM_MSG="[workflow-adapter] Agent '$AGENT_NAME' iteration $NEXT_ITERATION/$MAX_ITERATIONS | Retrying after dependency wait | Feature: $FEATURE_NAME"

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

# Check for completion signal (TASKS_COMPLETE, REVIEW_COMPLETE, WORKFLOW_COMPLETE)
SIGNAL="${COMPLETION_SIGNAL:-TASKS_COMPLETE}"

# Check if --complete mode is enabled (check_plan_completion field in state file)
CHECK_PLAN=$(echo "$FRONTMATTER" | grep '^check_plan_completion:' | sed 's/check_plan_completion: *//')

if echo "$LAST_OUTPUT" | grep -q "$SIGNAL"; then
  # If --complete mode, verify against plan.md before marking complete
  if [[ "$CHECK_PLAN" == "true" ]] && [[ -n "$FEATURE_NAME" ]]; then
    PLAN_FILE=".workflow-adapter/doc/feature_${FEATURE_NAME}/plan.md"
    if [[ -f "$PLAN_FILE" ]]; then
      # Check if agent has remaining TODO or IN_PROGRESS tasks
      REMAINING_TASKS=$(grep -E "^\s*-\s*\[" "$PLAN_FILE" | grep -i "assignee:.*$AGENT_NAME" | grep -v "DONE" | head -1 || true)

      if [[ -n "$REMAINING_TASKS" ]]; then
        echo "[workflow-adapter] Agent '$AGENT_NAME': $SIGNAL detected but has remaining tasks in plan.md"

        NEXT_ITERATION=$((ITERATION + 1))
        PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_STATE_FILE")

        # Update iteration
        TEMP_FILE="${AGENT_STATE_FILE}.tmp.$$"
        sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$AGENT_STATE_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$AGENT_STATE_FILE"

        SYSTEM_MSG="[workflow-adapter] Agent '$AGENT_NAME' iteration $NEXT_ITERATION/$MAX_ITERATIONS | Tasks still remaining in plan.md | Feature: $FEATURE_NAME"

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
    fi
  fi

  echo "[workflow-adapter] Agent '$AGENT_NAME': Completed ($SIGNAL detected)"
  rm -f "$AGENT_STATE_FILE"

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
  rm -f "$AGENT_STATE_FILE"
  exit 0
fi

# Not complete - continue loop with same prompt
NEXT_ITERATION=$((ITERATION + 1))

# Extract prompt (everything after the closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "Warning: No prompt found in state file" >&2
  rm -f "$AGENT_STATE_FILE"
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
