#!/bin/bash
# Execute all workflow agents in parallel for a specific feature
# Usage: ./execute-agents.sh <feature_name> [max_iterations]
#
# This script creates state files for each agent and starts them in parallel.
# The Stop hook handles automatic task continuation until TASKS_COMPLETE.

set -e

FEATURE_NAME=${1:-""}
MAX_ITERATIONS=${2:-10}
WORKFLOW_DIR=".workflow-adapter"
AGENTS_DIR="$WORKFLOW_DIR/agents"
LOGS_DIR="$WORKFLOW_DIR/logs"
FEATURE_DIR="$WORKFLOW_DIR/doc/feature_$FEATURE_NAME"
MESSAGES_DIR="$FEATURE_DIR/messages"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Get script directory for referencing other scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate name (agent name, feature name) - prevent path traversal and injection
validate_name() {
    local name="$1"
    local type="$2"

    if [[ -z "$name" ]]; then
        log_error "$type name cannot be empty"
        return 1
    fi

    # Only allow lowercase letters, numbers, hyphens, and underscores
    if [[ ! "$name" =~ ^[a-z0-9_-]+$ ]]; then
        log_error "Invalid $type name: '$name'"
        log_error "Only lowercase letters, numbers, hyphens, and underscores are allowed"
        return 1
    fi

    # Prevent path traversal
    if [[ "$name" == *".."* ]] || [[ "$name" == *"/"* ]] || [[ "$name" == *"\\"* ]]; then
        log_error "Invalid $type name: '$name' (path traversal not allowed)"
        return 1
    fi

    return 0
}

# Check prerequisites
check_prerequisites() {
    # Check feature name
    if [ -z "$FEATURE_NAME" ]; then
        log_error "Feature name required"
        log_error "Usage: ./execute-agents.sh <feature_name> [max_iterations]"
        exit 1
    fi

    # Validate feature name
    if ! validate_name "$FEATURE_NAME" "feature"; then
        exit 1
    fi

    # Check jq (required for hooks)
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        log_error "Install with: apt install jq (Linux) or brew install jq (macOS)"
        exit 1
    fi

    # Check claude CLI
    if ! command -v claude &> /dev/null; then
        log_error "claude CLI not found in PATH"
        log_error "Please install Claude Code: npm install -g @anthropic-ai/claude-code"
        exit 1
    fi

    # Check workflow directory
    if [ ! -d "$WORKFLOW_DIR" ]; then
        log_error "Workflow directory not found: $WORKFLOW_DIR"
        log_error "Run /workflow-adapter:install first"
        exit 1
    fi

    # Check agents directory
    if [ ! -d "$AGENTS_DIR" ]; then
        log_error "Agents directory not found: $AGENTS_DIR"
        log_error "Run /workflow-adapter:install first"
        exit 1
    fi

    # Check for agent files
    local agent_count=$(ls "$AGENTS_DIR"/*.md 2>/dev/null | wc -l)
    if [ "$agent_count" -eq 0 ]; then
        log_error "No agent files found in $AGENTS_DIR"
        log_error "Run /workflow-adapter:install first"
        exit 1
    fi

    # Check feature directory and plan
    if [ ! -d "$FEATURE_DIR" ]; then
        log_error "Feature directory not found: $FEATURE_DIR"
        log_error "Run /workflow-adapter:feature $FEATURE_NAME first"
        exit 1
    fi

    if [ ! -f "$FEATURE_DIR/plan.md" ]; then
        log_error "Feature plan not found: $FEATURE_DIR/plan.md"
        log_error "Run /workflow-adapter:feature-plan $FEATURE_NAME first"
        exit 1
    fi
}

# Create required directories
setup_directories() {
    mkdir -p "$LOGS_DIR"
    mkdir -p "$MESSAGES_DIR"
    mkdir -p ".claude"
    log_info "Logs directory: $LOGS_DIR"
}

# Get list of agents (excluding orchestrator for parallel run)
get_agents() {
    ls "$AGENTS_DIR"/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md$//' | grep -v orchestrator || true
}

# Extract system prompt from agent file (skip YAML frontmatter)
extract_system_prompt() {
    local file=$1
    # Skip YAML frontmatter (everything between first --- and second ---)
    awk 'BEGIN{skip=0} /^---$/{skip++; next} skip>=2{print}' "$file"
}

# Create agent state file and run single execution
run_agent() {
    local agent_name=$1

    # Validate agent name
    if ! validate_name "$agent_name" "agent"; then
        return 1
    fi

    local agent_file="$AGENTS_DIR/$agent_name.md"
    local log_file="$LOGS_DIR/${agent_name}_${TIMESTAMP}.log"
    local state_file=".claude/workflow-agent-${agent_name}.local.md"

    # Initialize log file
    {
        echo "========================================"
        echo "Agent: $agent_name"
        echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Max Iterations: $MAX_ITERATIONS"
        echo "Agent File: $agent_file"
        echo "State File: $state_file"
        echo "========================================"
        echo ""
    } > "$log_file"

    # Check if agent file exists
    if [ ! -f "$agent_file" ]; then
        echo "ERROR: Agent file not found: $agent_file" >> "$log_file"
        return 1
    fi

    # Extract system prompt
    local system_prompt
    system_prompt=$(extract_system_prompt "$agent_file")

    if [ -z "$system_prompt" ]; then
        echo "ERROR: Could not extract system prompt from $agent_file" >> "$log_file"
        return 1
    fi

    local user_prompt="You are the $agent_name agent. Execute your responsibilities now for feature: $FEATURE_NAME

## Your Feature
Feature: $FEATURE_NAME
Plan: $FEATURE_DIR/plan.md
Context: $FEATURE_DIR/context.md

## Workflow
1. Read .workflow-adapter/doc/principle.md for guidelines
2. Read $FEATURE_DIR/context.md for project context
3. Read $FEATURE_DIR/plan.md and find YOUR assigned tasks (look for your name: $agent_name)
4. Work on your assigned tasks and update their status in plan.md (TODO -> IN_PROGRESS -> DONE)
5. Write status messages to $MESSAGES_DIR/ if needed
6. When done, check $MESSAGES_DIR/ for messages addressed to you (from_*_to_${agent_name}_*.md)
7. If all YOUR tasks are complete and messages processed, output TASKS_COMPLETE

Start working now."

    # Create state file for Stop hook
    cat > "$state_file" << EOF
---
active: true
agent_name: $agent_name
feature_name: $FEATURE_NAME
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_signal: "TASKS_COMPLETE"
started_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
---

$user_prompt
EOF

    log_info "Created state file: $state_file"

    # Execute claude once - the Stop hook will handle continuation
    {
        echo "--- Starting execution ---"
        echo "Time: $(date '+%H:%M:%S')"
        echo ""
    } >> "$log_file"

    # Run claude with system prompt - Stop hook handles iteration
    local output
    output=$(claude --print \
        --system-prompt "$system_prompt" \
        --dangerously-skip-permissions \
        "$user_prompt" 2>&1) || true

    # Log output
    echo "$output" >> "$log_file"

    # Check final status
    if [ -f "$state_file" ]; then
        # State file still exists - agent may have hit max iterations or error
        local final_iter=$(grep '^iteration:' "$state_file" | sed 's/iteration: *//')
        {
            echo ""
            echo "========================================"
            echo "Agent $agent_name stopped at iteration $final_iter"
            echo "State file still exists - may need manual review"
            echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "========================================"
        } >> "$log_file"
    else
        # State file removed - agent completed successfully
        {
            echo ""
            echo "========================================"
            echo "Agent $agent_name COMPLETED"
            echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "========================================"
        } >> "$log_file"
    fi
}

# Main execution
main() {
    echo ""
    log_info "Workflow Agent Execution (Hook-Based)"
    echo "========================================"

    # Check prerequisites
    check_prerequisites

    # Setup
    setup_directories

    # Get agents
    local agents
    agents=$(get_agents)

    if [ -z "$agents" ]; then
        log_error "No worker agents found (only orchestrator/reviewer exist)"
        log_error "Run /workflow-adapter:install with agent count > 0"
        exit 1
    fi

    echo ""
    log_info "Configuration:"
    echo "  Feature: $FEATURE_NAME"
    echo "  Max iterations: $MAX_ITERATIONS"
    echo "  Timestamp: $TIMESTAMP"
    echo "  Agents: $agents"
    echo ""

    # Start all agents in background
    local pids=()
    for agent in $agents; do
        log_info "Starting agent: $agent"
        run_agent "$agent" &
        pids+=($!)
    done

    echo ""
    log_info "All agents started (${#pids[@]} processes)"
    log_info "Logs: $LOGS_DIR/*_${TIMESTAMP}.log"
    log_info "State files: .claude/workflow-agent-*.local.md"
    echo ""
    log_info "Waiting for completion..."
    log_info "(Stop hook handles automatic task continuation)"
    echo ""

    # Wait for all background processes
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait $pid; then
            ((failed++))
        fi
    done

    echo ""
    echo "========================================"
    log_info "Execution Complete"
    echo "========================================"
    echo ""

    if [ $failed -gt 0 ]; then
        log_warn "$failed agent(s) encountered errors"
    fi

    echo "Summary:"
    for agent in $agents; do
        local log_file="$LOGS_DIR/${agent}_${TIMESTAMP}.log"
        local state_file=".claude/workflow-agent-${agent}.local.md"
        if [ -f "$log_file" ]; then
            if grep -q "COMPLETED" "$log_file"; then
                echo "  - $agent: COMPLETED"
            elif [ -f "$state_file" ]; then
                local iter=$(grep '^iteration:' "$state_file" 2>/dev/null | sed 's/iteration: *//' || echo "?")
                echo "  - $agent: STOPPED (iteration $iter)"
            else
                echo "  - $agent: UNKNOWN"
            fi
        else
            echo "  - $agent: NO_LOG"
        fi
    done

    # Clean up any remaining state files
    local remaining=$(ls .claude/workflow-agent-*.local.md 2>/dev/null | wc -l)
    if [ "$remaining" -gt 0 ]; then
        echo ""
        log_warn "$remaining agent(s) have state files remaining"
        log_warn "To cancel: /workflow-adapter:cancel-agent --all"
    fi

    echo ""
    log_info "Check detailed logs: tail -100 $LOGS_DIR/*_${TIMESTAMP}.log"
    log_info "Check messages: ls $FEATURE_DIR/messages/"
    log_info "Validate results: /workflow-adapter:validate $FEATURE_NAME"
}

# Run main
main
