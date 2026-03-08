#!/usr/bin/env bun
/**
 * ralph-session-info.ts
 *
 * Outputs the current timestamp and detected session_id as key=value lines.
 * Used by skill prompts to populate ralph-state.md frontmatter.
 *
 * Usage: bun scripts/ralph-session-info.ts
 *
 * Output:
 *   TIMESTAMP=2026-03-07T05:06:39Z
 *   SESSION_ID=286c3d33-c9dd-47cb-9381-86a0bae6b14a
 */

import { detectSessionId } from "./lib/detect-session";

const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const sessionId = detectSessionId() ?? "";

console.log(`TIMESTAMP=${timestamp}`);
console.log(`SESSION_ID=${sessionId}`);
