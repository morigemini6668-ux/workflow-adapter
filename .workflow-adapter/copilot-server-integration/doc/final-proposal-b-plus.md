# Final Proposal: Approach B+ (Enhanced SDK Scripts)

## Summary

Incrementally enhance the existing Copilot server integration with SDK-based TypeScript scripts, scoped security, and minimal lifecycle management. No daemon managers, no MCP wrappers, no session pools.

## Security Model

### Principle: Least Privilege Per Session

Instead of `approveAll`, use the SDK's `onPreToolUse` hook to enforce scoped permissions per session type.

#### Session Types and Permission Tiers

| Session Type | Use Case | Allowed Tools | Blocked Tools |
|-------------|----------|---------------|---------------|
| **readonly** | Q&A, explain code, search | `read_file`, `grep`, `glob`, `view`, `search_files`, `list_directory` | `edit_file`, `write_file`, `delete_file`, `shell`, `bash`, `git_push` |
| **edit** | Code generation, refactoring | All readonly + `edit_file`, `write_file`, `create_file` | `shell`, `bash`, `delete_file`, `git_push` |
| **full** | Autonomous agent tasks | All tools | None (equivalent to `approveAll`) |

#### Implementation via `onPreToolUse` Hook

```typescript
const READONLY_ALLOWED = new Set([
    "read_file", "grep", "glob", "view", "search_files",
    "list_directory", "find_file", "explain",
]);

const EDIT_ALLOWED = new Set([
    ...READONLY_ALLOWED,
    "edit_file", "write_file", "create_file",
]);

type PermissionTier = "readonly" | "edit" | "full";

function createPermissionHandler(tier: PermissionTier) {
    return async (input: { toolName: string }) => {
        if (tier === "full") {
            return { permissionDecision: "allow" as const };
        }
        const allowed = tier === "edit" ? EDIT_ALLOWED : READONLY_ALLOWED;
        if (allowed.has(input.toolName)) {
            return { permissionDecision: "allow" as const };
        }
        return {
            permissionDecision: "deny" as const,
            permissionDecisionReason:
                `Tool '${input.toolName}' is not permitted in '${tier}' mode.`,
        };
    };
}
```

#### Directory Scoping

Restrict file access to the project working directory:

```typescript
const ALLOWED_DIRS = [process.cwd(), "/tmp"];

hooks: {
    onPreToolUse: async (input) => {
        if (["read_file", "edit_file", "write_file"].includes(input.toolName)) {
            const path = (input.toolArgs as { path: string }).path;
            if (!ALLOWED_DIRS.some(dir => path.startsWith(dir))) {
                return {
                    permissionDecision: "deny",
                    permissionDecisionReason:
                        `File access restricted to: ${ALLOWED_DIRS.join(", ")}`,
                };
            }
        }
        return { permissionDecision: "allow" };
    },
}
```

### Network Security

1. **localhost only**: `copilot --headless` binds to `127.0.0.1` / `::1` by default. Never expose to `0.0.0.0`.
2. **No auth token on wire**: The JSON-RPC connection between SDK client and CLI server has no built-in auth. This is acceptable because both run on localhost. If deploying in Docker, keep them in the same network namespace.
3. **Non-root execution**: Run the headless server as the same user who owns the project files.

### Audit Trail

The `onPreToolUse` and `onPostToolUse` hooks provide a natural audit point:

```typescript
hooks: {
    onPreToolUse: async (input, invocation) => {
        console.error(`[copilot-audit] session=${invocation.sessionId} ` +
            `tool=${input.toolName} args=${JSON.stringify(input.toolArgs)}`);
        // ... permission check ...
    },
}
```

---

## Phase Breakdown

### Phase 1: Server Lifecycle (Now)

**What changes:**
- Add `scripts/copilot-server-start.ts` -- starts `copilot --headless --port PORT`, writes port to `copilot-server-port.conf`, verifies with ping
- Add `scripts/copilot-server-stop.ts` -- reads port file, sends shutdown, removes port file
- Add health-check to `ask-copilot` skill (ping before sending prompt; clear error if server is down)

**What stays:**
- `copilot_chat.py` -- unchanged, continues to work
- `copilot-exec.ts` -- unchanged, independent one-shot mode
- `ask-copilot` skill SKILL.md -- minor update to document health-check behavior

**Server lifecycle ownership:**
- **User starts**: `bun scripts/copilot-server-start.ts [--port 4321]`
- **User stops**: `bun scripts/copilot-server-stop.ts` or Ctrl+C on the server process
- **No auto-start**: The server is not started automatically by skills or plugins
- **No watchdog**: If it crashes, the user restarts it. Skills report "server not running" on next call.
- **Port file**: `copilot-server-port.conf` in project root. Presence = server expected to be running.

**Deliverables:**
```
scripts/copilot-server-start.ts   (new, ~50 lines)
scripts/copilot-server-stop.ts    (new, ~30 lines)
skills/ask-copilot/SKILL.md       (minor update: health-check docs)
```

### Phase 2: SDK Client Migration (When `copilot_chat.py` hits limits)

**Trigger conditions** (any one):
- Need to see tool execution events (Copilot using tools during response)
- Need session reuse / persistence across calls
- Need scoped permissions (readonly vs edit vs full)
- SDK exits Technical Preview
- JSON-RPC protocol changes break `copilot_chat.py`

**What changes:**
- Add `scripts/copilot-sdk-client.ts` using `@github/copilot-sdk`
- Add `@github/copilot-sdk` as dependency (pinned version)
- Update `ask-copilot` skill to use SDK client instead of Python script
- Implement permission tiers (readonly/edit/full) via `onPreToolUse` hook

**What stays (as fallback):**
- `copilot_chat.py` -- kept as emergency fallback, not actively used
- `copilot-exec.ts` -- unchanged, separate one-shot use case

**SDK client interface:**

```bash
# Simple Q&A (readonly mode)
bun scripts/copilot-sdk-client.ts --prompt "Explain this function" --mode readonly

# Code generation (edit mode)
bun scripts/copilot-sdk-client.ts --prompt "Refactor this module" --mode edit

# Full agent (all tools)
bun scripts/copilot-sdk-client.ts --prompt "Fix all lint errors" --mode full

# With session reuse
bun scripts/copilot-sdk-client.ts --prompt "Continue" --session-id my-session

# Read prompt from file
bun scripts/copilot-sdk-client.ts --prompt-file /tmp/prompt.md --mode edit
```

**SDK risk mitigation:**
- Pin version: `"@github/copilot-sdk": "0.x.y"` (exact, no range)
- Thin adapter: All SDK calls go through a single `CopilotAdapter` class (~20 lines). If API changes, only this class needs updating.
- Fallback: `copilot_chat.py` remains functional for basic Q&A

**Deliverables:**
```
scripts/copilot-sdk-client.ts     (new, ~150 lines)
scripts/copilot-adapter.ts        (new, ~50 lines, thin SDK wrapper)
package.json                       (add @github/copilot-sdk dependency)
skills/ask-copilot/SKILL.md       (update to reference SDK client)
skills/ask-copilot/scripts/copilot_chat.py  (kept as fallback, not deleted)
```

### Phase 3: MCP Wrapper (Only if concrete need arises)

**Not planned. Build only when:**
- Another AI agent (not Claude Code) needs to call Copilot
- An integration requires standard MCP protocol
- The team explicitly decides to expose Copilot as a shared service

---

## What Stays vs What Changes (Summary)

| Component | Phase 1 | Phase 2 | Notes |
|-----------|---------|---------|-------|
| `copilot-exec.ts` | Unchanged | Unchanged | Independent one-shot mode |
| `copilot_chat.py` | Unchanged | Kept as fallback | Emergency fallback only |
| `ask-copilot/SKILL.md` | Minor update | Updated | Health-check, then SDK client |
| `copilot/SKILL.md` | Unchanged | Unchanged | Config generator, unrelated |
| `copilot-server-start.ts` | **New** | Unchanged | Server lifecycle |
| `copilot-server-stop.ts` | **New** | Unchanged | Server lifecycle |
| `copilot-sdk-client.ts` | N/A | **New** | SDK-based client |
| `copilot-adapter.ts` | N/A | **New** | Thin SDK wrapper |
| `@github/copilot-sdk` | N/A | **New dep** | Pinned version |

## Health Check Flow

```
User invokes ask-copilot skill
    |
    v
Read port from copilot-server-port.conf
    |
    +-- File missing? --> "Server not started. Run: bun scripts/copilot-server-start.ts"
    |
    v
Ping server on localhost:PORT
    |
    +-- No pong? --> "Server not responding. Restart: bun scripts/copilot-server-start.ts"
    |
    v
Send prompt, collect response
    |
    +-- Timeout? --> "Server timed out after N seconds. Check server logs."
    |
    v
Return response to user
```
