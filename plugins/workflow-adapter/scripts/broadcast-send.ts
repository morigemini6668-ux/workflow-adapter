#!/usr/bin/env bun
/**
 * broadcast-send.ts
 *
 * CLI helper for sending broadcast messages.
 *
 * Usage:
 *   bun broadcast-send.ts --from "coffee-agent" --subject "커피 주문 완료" --body "아메리카노 1잔 주문 완료" [--priority urgent]
 *   echo '{"from":"...","subject":"...","body":"..."}' | bun broadcast-send.ts --stdin
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PENDING_DIR = join(
  homedir(),
  ".claude",
  "workflow-adapter",
  "broadcast",
  "pending"
);

function generateFilename(subject: string): string {
  const ts = Date.now();
  const slug = subject
    .replace(/[^a-zA-Z0-9가-힣]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${ts}-${slug || "message"}.json`;
}

async function main() {
  const args = process.argv.slice(2);

  let from = "";
  let subject = "";
  let body = "";
  let priority: "normal" | "urgent" = "normal";
  let useStdin = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--from":
        from = args[++i] ?? "";
        break;
      case "--subject":
        subject = args[++i] ?? "";
        break;
      case "--body":
        body = args[++i] ?? "";
        break;
      case "--priority":
        priority = args[++i] === "urgent" ? "urgent" : "normal";
        break;
      case "--stdin":
        useStdin = true;
        break;
    }
  }

  let message: Record<string, string>;

  if (useStdin) {
    const text = await Bun.stdin.text();
    message = JSON.parse(text.trim());
    from = message.from ?? from;
    subject = message.subject ?? subject;
    body = message.body ?? body;
    priority = (message.priority as "normal" | "urgent") ?? priority;
  }

  if (!from || !subject || !body) {
    console.error(
      "Usage: bun broadcast-send.ts --from <sender> --subject <subject> --body <body> [--priority urgent]"
    );
    process.exit(1);
  }

  const msg = {
    from,
    subject,
    body,
    priority,
    created_at: new Date().toISOString(),
  };

  mkdirSync(PENDING_DIR, { recursive: true });

  const filename = generateFilename(subject);
  const filepath = join(PENDING_DIR, filename);
  writeFileSync(filepath, JSON.stringify(msg, null, 2));

  console.log(`✅ Message sent: ${filepath}`);
}

main().catch((err) => {
  console.error(`Failed to send broadcast: ${err}`);
  process.exit(1);
});
