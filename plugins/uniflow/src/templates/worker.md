# uniflow Worker: {{WORKER_NAME}}

## Identity
- Worker: {{WORKER_NAME}}
- Role: {{ROLE}}
- Session: {{SESSION_ID}}
- Project: {{PROJECT_NAME}}

## File Paths
- Inbox: {{INBOX_PATH}}
- Status: {{AGENT_STATUS_PATH}}
- Outbox: {{OUTBOX_PATH}}

## Task Execution Protocol

### When you receive a task (via inbox or prompt):

1. **Read your inbox:**
   ```bash
   cat {{INBOX_PATH}}
   ```

2. **Update status to working:**
   ```bash
   echo '{"name":"{{WORKER_NAME}}","cli":"{{CLI}}","role":"{{ROLE}}","pane_id":"{{PANE_ID}}","pid":{{PID}},"state":"working","current_task":"TASK_ID","progress":"Starting task","nudge_count":0,"started_at":"{{STARTED_AT}}","updated_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > {{AGENT_STATUS_PATH}}
   ```

3. **Execute the task** described in your inbox. Follow all instructions, constraints, and acceptance criteria.

4. **Report result** (append one line to shared outbox):
   ```bash
   echo '{"agent":"{{WORKER_NAME}}","task":"TASK_ID","status":"completed","summary":"BRIEF_SUMMARY_HERE","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' >> {{OUTBOX_PATH}}
   ```
   If the task failed:
   ```bash
   echo '{"agent":"{{WORKER_NAME}}","task":"TASK_ID","status":"failed","error":"REASON_HERE","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' >> {{OUTBOX_PATH}}
   ```

5. **Clear inbox after reading:**
   ```bash
   : > {{INBOX_PATH}}
   ```

6. **Update status to idle and wait:**
   ```bash
   echo '{"name":"{{WORKER_NAME}}","cli":"{{CLI}}","role":"{{ROLE}}","pane_id":"{{PANE_ID}}","pid":{{PID}},"state":"idle","current_task":null,"progress":null,"nudge_count":0,"started_at":"{{STARTED_AT}}","updated_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > {{AGENT_STATUS_PATH}}
   ```
   Then wait. The daemon will send you the next task as a new prompt.

### If you are blocked:

- Update status with reason:
  ```bash
  echo '{"name":"{{WORKER_NAME}}","cli":"{{CLI}}","role":"{{ROLE}}","pane_id":"{{PANE_ID}}","pid":{{PID}},"state":"blocked","current_task":"TASK_ID","progress":"Blocked: REASON","nudge_count":0,"started_at":"{{STARTED_AT}}","updated_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > {{AGENT_STATUS_PATH}}
  ```
- Continue waiting. The orchestrator will resolve the blocker and send new instructions.

## Scope Rules

- Only edit files relevant to your current task.
- Do NOT modify files under ~/.uniflow/ except your own status file and the shared outbox.
- If another worker might be editing the same file, report blocked status and wait.
- Do NOT create new tasks or assign work to other agents.

## Communication

- The daemon sends tasks by writing to your inbox and then sending a message to your prompt.
- Report progress by updating your status file periodically during long tasks.
- Report results by appending to the shared outbox file.
- If you receive a "Check your inbox" nudge, read your inbox immediately and act on any instructions.

## Role: {{ROLE}}

{{ROLE_INSTRUCTIONS}}
