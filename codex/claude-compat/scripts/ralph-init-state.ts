#!/usr/bin/env bun
/**
 * ralph-init-state.ts
 *
 * Creates the initial ralph-state.md for a Ralph loop session.
 * Called by the ralph-execute skill at the start of the first iteration.
 *
 * Usage: bun scripts/ralph-init-state.ts <subject> [--max-iterations <N>]
 *
 * Creates: .workflow-adapter/{subject}/ralph-state.md
 */

import { existsSync } from "fs";
import { join } from "path";
import { detectSessionId } from "./lib/detect-session";

function printUsage(): void {
  process.stderr.write(
    "Usage: bun scripts/ralph-init-state.ts <subject> [--max-iterations <N>]\n"
  );
}

function parseArgs(args: string[]): {
  subject: string;
  maxIterations: number;
  sessionId: string | null;
} {
  let subject = "";
  let maxIterations = 10;
  let sessionId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max-iterations") {
      const val = args[i + 1];
      if (!val || isNaN(Number(val))) {
        process.stderr.write(
          `[ralph-init] ERROR: --max-iterations requires a numeric argument\n`
        );
        process.exit(1);
      }
      maxIterations = Number(val);
      i++;
    } else if (args[i] === "--session-id") {
      sessionId = args[i + 1] ?? null;
      i++;
    } else if (!args[i].startsWith("--")) {
      subject = args[i];
    }
  }

  return { subject, maxIterations, sessionId };
}


async function main(): Promise<void> {
  // process.argv: [bun, script, ...userArgs]
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { subject, maxIterations, sessionId: argSessionId } = parseArgs(args);
  const sessionId = argSessionId || detectSessionId();

  if (!subject) {
    process.stderr.write(
      `[ralph-init] ERROR: <subject> argument is required\n`
    );
    printUsage();
    process.exit(1);
  }

  // Validate subject directory exists
  const subjectDir = join(".workflow-adapter", subject);
  if (!existsSync(subjectDir)) {
    process.stderr.write(
      `[ralph-init] ERROR: Subject directory does not exist: ${subjectDir}\n` +
        `  Run /workflow-adapter:plan ${subject} first to create the subject directory and plan.\n`
    );
    process.exit(1);
  }

  // Validate plan.md exists
  const planPath = join(subjectDir, "plan.md");
  if (!existsSync(planPath)) {
    process.stderr.write(
      `[ralph-init] ERROR: plan.md not found: ${planPath}\n` +
        `  Run /workflow-adapter:plan ${subject} first to create the plan.\n`
    );
    process.exit(1);
  }

  // Check if state file already exists
  const statePath = join(subjectDir, "ralph-state.md");
  if (existsSync(statePath)) {
    process.stderr.write(
      `[ralph-init] ERROR: State file already exists: ${statePath}\n` +
        `  An active Ralph loop may already be running. ` +
        `Run /workflow-adapter:ralph-cancel to stop it first.\n`
    );
    process.exit(1);
  }

  // Build started_at timestamp
  const startedAt = new Date().toISOString();

  // Build the re-injection prompt body
  const body = `You are the Ralph-Execute orchestrator. Read \`.workflow-adapter/${subject}/plan.md\` and continue executing pending tasks.

1. Read plan.md — identify all [ ], [~], and [!] tasks
2. Read worker.md — determine executer allocation
3. Spawn one-shot executer subagents for pending/failed tasks only
4. Inject failure context from previous iterations (see ## Loop State in plan.md)
5. Wait for results, update plan.md
6. Spawn reviewer to verify completed tasks
7. If all tasks [x] and verification PASS: output <promise>ALL JOB COMPLETE</promise>
8. If tasks remain: output current status summary (Stop hook will continue the loop)`;

  // Build full state file content
  const sessionLine = sessionId ? `\nsession_id: "${sessionId}"` : "";
  const stateContent = `---
iteration: 0
max_iterations: ${maxIterations}
completion_promise: "ALL JOB COMPLETE"
subject: ${subject}
started_at: "${startedAt}"${sessionLine}
---

${body}
`;

  // Write state file
  try {
    await Bun.write(statePath, stateContent);
    process.stdout.write(
      `[ralph-init] Created state file: ${statePath}\n` +
        `  subject: ${subject}\n` +
        `  max_iterations: ${maxIterations}\n` +
        `  started_at: ${startedAt}\n` +
        `  session_id: ${sessionId ?? "(unbound)"}\n`
    );
  } catch (err) {
    process.stderr.write(
      `[ralph-init] ERROR: Failed to write state file: ${statePath}\n  ${err}\n`
    );
    process.exit(1);
  }
}

main();
