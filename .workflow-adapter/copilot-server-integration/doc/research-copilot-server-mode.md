# Research: Copilot CLI Server Mode Integration

## Topic
How to run GitHub Copilot CLI in server mode with full permissions and integrate it into workflow-adapter via MCP server or skills scripts.

## Key Findings

### 1. Copilot CLI Server Mode (Headless)

The Copilot CLI natively supports a headless server mode via JSON-RPC over TCP.

**Start command:**
```bash
copilot --headless --port 4321
```

Key properties:
- Listens on TCP port (specified or random)
- JSON-RPC 2.0 protocol with LSP-style framing (`Content-Length` headers)
- Multiple SDK clients can share one CLI server
- Independent lifecycle from the application
- Session state stored at `~/.copilot/session-state/{sessionId}/`
- 30-minute idle timeout for sessions

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/docs/getting-started.md:1268-1274`, `/Users/dalpark/workspace/github/copilot-sdk/docs/guides/setup/backend-services.md`

### 2. Copilot SDK Architecture

```
Application -> SDK Client -> JSON-RPC -> Copilot CLI (server mode)
```

The SDK communicates via JSON-RPC. Two transport modes:
- **stdio** (default): SDK spawns CLI as child process, communicates via stdin/stdout
- **TCP**: SDK connects to external CLI server via `cliUrl` option

**Connection to external server (TypeScript):**
```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient({
    cliUrl: "localhost:4321"
});

const session = await client.createSession({
    model: "gpt-4.1",
    onPermissionRequest: approveAll  // Full permissions
});

const response = await session.sendAndWait({ prompt: "..." });
```

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/nodejs/README.md`, `/Users/dalpark/workspace/github/copilot-sdk/docs/getting-started.md:1258-1393`

### 3. Full Permissions

By default, the SDK operates with `--allow-all` equivalent, enabling all first-party tools (file system, Git, web requests). The `approveAll` permission handler auto-approves all tool requests:

```typescript
import { approveAll } from "@github/copilot-sdk";
const session = await client.createSession({ onPermissionRequest: approveAll });
```

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/README.md:84-86`

### 4. Authentication Methods

Priority order:
1. Explicit `githubToken` in constructor
2. Environment variables: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`
3. Stored OAuth credentials from `copilot` CLI login
4. GitHub CLI (`gh auth`) credentials
5. **BYOK**: Use own API keys (no GitHub auth needed)

For server mode, set token via env var:
```bash
export COPILOT_GITHUB_TOKEN="gho_xxxx"
copilot --headless --port 4321
```

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/docs/auth/index.md`

### 5. MCP Server Integration

The SDK can consume MCP servers natively in session config:

```typescript
const session = await client.createSession({
    mcpServers: {
        "my-server": {
            type: "local",
            command: "node",
            args: ["./mcp-server.js"],
            tools: ["*"],
        },
        "remote-server": {
            type: "http",
            url: "https://example.com/mcp/",
        }
    }
});
```

This means Copilot can **consume** MCP servers. However, the question is whether Copilot itself can be **exposed as** an MCP server.

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/docs/mcp/overview.md`

### 6. Custom Skills Integration

The SDK supports loading skill directories:

```typescript
const session = await client.createSession({
    skillDirectories: ["./skills/code-review"],
    disabledSkills: ["experimental"],
});
```

Skills are `SKILL.md` files in named subdirectories, loaded into session context.

**Source:** `/Users/dalpark/workspace/github/copilot-sdk/docs/guides/skills.md`

### 7. Existing Workflow-Adapter Integration

#### copilot-exec.ts (Current: CLI one-shot mode)
- Path: `/Users/dalpark/workspace/src/workflow-adapter/scripts/copilot-exec.ts`
- Spawns `copilot` CLI as one-shot process with `-p` (prompt), `--allow-all-tools`, `--autopilot`
- Uses default model `gpt-5.3-codex`
- No session persistence; each call is independent
- Limitation: No persistent server, cold start each time

#### copilot_chat.py (Current: JSON-RPC client)
- Path: `/Users/dalpark/workspace/src/workflow-adapter/skills/ask-copilot/scripts/copilot_chat.py`
- Connects to running Copilot CLI server via TCP socket
- Uses JSON-RPC 2.0 with LSP-style framing
- Reads port from `copilot-server-port.conf`
- Implements ping, session create, send message, collect streaming response
- **This is already the pattern we want to formalize and expand**

#### ask-copilot skill
- Path: `/Users/dalpark/workspace/src/workflow-adapter/skills/ask-copilot/SKILL.md`
- Sends messages to locally running Copilot CLI server
- Requires server to be pre-started and port recorded

#### copilot skill (generator)
- Path: `/Users/dalpark/workspace/src/workflow-adapter/skills/copilot/SKILL.md`
- Converts workflow-adapter plugin config into Copilot-compatible `.github/` config files
- Not directly related to server mode

### 8. SDK Protocol Details

The JSON-RPC protocol uses these key methods:
- `ping` -> `{ message: "pong", timestamp: ... }`
- `session.create` -> emits `session.start` with `sessionId`
- `session.send` with `{ sessionId, prompt }` -> streams `assistant.message_delta` events, ends with `session.idle`
- Session events: `assistant.message`, `assistant.message_delta`, `tool.execution_start`, `tool.execution_complete`, `session.idle`

**Source:** `/Users/dalpark/workspace/src/workflow-adapter/skills/ask-copilot/scripts/copilot_chat.py` (reverse-engineered protocol)

## Integration Approaches

### Approach A: Copilot as MCP Server (Expose Copilot via MCP)

Build a thin MCP server wrapper that proxies requests to the Copilot CLI server.

**Architecture:**
```
Claude/Other Agent -> MCP Protocol -> MCP Wrapper Server -> JSON-RPC -> Copilot CLI (headless)
```

**Implementation:**
- Create an MCP server (TypeScript with `@modelcontextprotocol/sdk`) that:
  - Connects to Copilot CLI server via `@github/copilot-sdk`
  - Exposes tools: `copilot_ask`, `copilot_code_review`, `copilot_explain`, etc.
  - Manages session lifecycle (create, reuse, destroy)

**Pros:**
- Standard MCP protocol -> any MCP-compatible agent can use it
- Clean separation of concerns
- Can be configured in Claude Code's MCP settings

**Cons:**
- Additional layer of abstraction
- Need to maintain MCP server code
- MCP tool definitions must be predefined (can't dynamically expose Copilot's full tool set)

### Approach B: SDK Direct Integration via Skills Scripts

Enhance existing `copilot_chat.py` or create a new TypeScript script using `@github/copilot-sdk`.

**Architecture:**
```
Claude Agent -> Skill Script -> @github/copilot-sdk -> Copilot CLI (headless)
```

**Implementation:**
- Create `scripts/copilot-server.ts` that:
  - Connects to Copilot CLI server via SDK
  - Accepts prompts via CLI args or stdin
  - Returns structured results
  - Manages persistent sessions

**Pros:**
- Simpler implementation
- Direct control over sessions and tools
- Leverages existing skill infrastructure
- No additional protocol layer

**Cons:**
- Only usable from workflow-adapter skills
- Each invocation is a separate process (unless we use a daemon)

### Approach C: Hybrid - Copilot Server Manager + MCP + Skills

Start Copilot CLI server as a managed daemon, expose via both MCP and skills scripts.

**Architecture:**
```
                    +--> MCP Server --> MCP-compatible clients
Copilot CLI (headless) --|
                    +--> Skills Scripts --> workflow-adapter
```

**Implementation:**
1. **Server manager script**: Start/stop/health-check Copilot CLI headless server
2. **MCP wrapper**: Thin MCP server connecting to headless Copilot
3. **Skills scripts**: Enhanced `copilot_chat.py` / new TS scripts
4. **Session management**: Shared session pool across MCP and skills

## Recommendations

### Recommended: Approach C (Hybrid)

1. **Server Lifecycle Management**
   - Create `scripts/copilot-server-start.ts` to start `copilot --headless --port <PORT>`
   - Write port to `copilot-server-port.conf` (already expected by `copilot_chat.py`)
   - Health check via ping
   - Use `COPILOT_GITHUB_TOKEN` env var for auth

2. **SDK-Based Client Script**
   - Replace raw socket `copilot_chat.py` with SDK-based `copilot-sdk-client.ts`
   - Use `@github/copilot-sdk` with `cliUrl` pointing to the headless server
   - Support persistent sessions, custom tools, MCP server passthrough, skill directories

3. **Optional MCP Wrapper**
   - If needed, create an MCP server that wraps the SDK client
   - Expose as tools in Claude Code's MCP config

### Implementation Priority

1. **Phase 1**: Server lifecycle management (start/stop/health)
2. **Phase 2**: SDK-based client replacing raw socket communication
3. **Phase 3**: MCP wrapper (if cross-agent access needed)
4. **Phase 4**: Session management and persistence

## Open Questions

1. **Server persistence**: Should the Copilot server start automatically with the plugin, or require manual start?
2. **Port management**: Fixed port vs dynamic port? Fixed is simpler for configuration.
3. **Authentication**: Use existing `copilot` CLI login or explicit token via env var?
4. **Session strategy**: One session per conversation or persistent sessions across calls?
5. **Model selection**: Default to `gpt-5.3-codex` (current) or make configurable?
6. **BYOK**: Should we support using Copilot with custom API keys (e.g., Anthropic models via Copilot runtime)?
7. **MCP server priority**: Is exposing Copilot as an MCP server a requirement, or is skills-script integration sufficient?

## Technical Notes

- The `copilot_chat.py` already implements the core JSON-RPC protocol correctly
- The `@github/copilot-sdk` npm package handles all protocol details and adds session management, streaming, tools, hooks, and MCP support
- Copilot SDK is in "Technical Preview" -- API may change
- Node.js >= 18 required for the SDK
- The SDK can also run with BYOK (no GitHub subscription needed) which opens interesting possibilities

## Sources

- `/Users/dalpark/workspace/github/copilot-sdk/README.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/getting-started.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/guides/setup/backend-services.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/guides/setup/local-cli.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/mcp/overview.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/guides/skills.md`
- `/Users/dalpark/workspace/github/copilot-sdk/docs/auth/index.md`
- `/Users/dalpark/workspace/github/copilot-sdk/nodejs/README.md`
- `/Users/dalpark/workspace/github/copilot-sdk/nodejs/src/client.ts`
- `/Users/dalpark/workspace/src/workflow-adapter/scripts/copilot-exec.ts`
- `/Users/dalpark/workspace/src/workflow-adapter/skills/ask-copilot/scripts/copilot_chat.py`
- `/Users/dalpark/workspace/src/workflow-adapter/skills/ask-copilot/SKILL.md`
