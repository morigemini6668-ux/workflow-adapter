#!/usr/bin/env bun
/**
 * broadcast-check.ts
 *
 * PreToolUse hook — runs before every tool call to check for new broadcast
 * messages. If messages exist, outputs them as structured JSON so they get
 * injected into Claude's context via additionalContext.
 *
 * Performance: when no messages are pending, this is a single readdir on an
 * empty directory (~2-5ms). Safe for high-frequency PreToolUse execution.
 *
 * Exit 0 always (never block tool use).
 * Stdout JSON with hookSpecificOutput.additionalContext = injected into context.
 */

import { readdirSync, readFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BROADCAST_DIR = join(homedir(), ".claude", "workflow-adapter", "broadcast");
const PENDING_DIR = join(BROADCAST_DIR, "pending");
const ARCHIVE_DIR = join(BROADCAST_DIR, "archive");

interface BroadcastMessage {
  from: string;
  subject: string;
  body: string;
  priority?: "normal" | "urgent";
  created_at: string;
}

try {
  let files: string[];
  try {
    files = readdirSync(PENDING_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    // Directory doesn't exist or unreadable — no messages
    process.exit(0);
  }

  if (files.length === 0) process.exit(0);

  // Ensure archive directory exists
  mkdirSync(ARCHIVE_DIR, { recursive: true });

  const messages: BroadcastMessage[] = [];
  for (const file of files) {
    const src = join(PENDING_DIR, file);
    try {
      const raw = readFileSync(src, "utf-8");
      const msg: BroadcastMessage = JSON.parse(raw);
      messages.push(msg);
      renameSync(src, join(ARCHIVE_DIR, file));
    } catch {
      // Malformed message — move to archive anyway to avoid re-reading
      try {
        renameSync(src, join(ARCHIVE_DIR, `malformed-${file}`));
      } catch {
        // give up on this file
      }
    }
  }

  if (messages.length === 0) process.exit(0);

  // Format messages for Claude's context
  const lines: string[] = [];
  lines.push(`📨 [BROADCAST] ${messages.length}개의 새 메시지:`);
  lines.push("");

  for (const msg of messages) {
    const icon = msg.priority === "urgent" ? "🔴" : "📩";
    lines.push(`${icon} [${msg.from}] ${msg.subject}`);
    lines.push(`   ${msg.body}`);
    lines.push(`   (${msg.created_at})`);
    lines.push("");
  }

  lines.push("⚡ 이 메시지를 사용자에게 즉시 전달하세요. 사용자가 알림을 놓치지 않도록 현재 작업 흐름 중간이라도 먼저 알려주세요.");

  const hasUrgent = messages.some((m) => m.priority === "urgent");

  // Output structured JSON for reliable context injection via additionalContext
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: lines.join("\n"),
      ...(hasUrgent && { priority: "urgent" }),
    },
  };

  process.stdout.write(JSON.stringify(output));
} catch {
  // Silent fail — never block tool use
  process.exit(0);
}
