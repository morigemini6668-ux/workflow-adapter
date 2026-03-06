#!/usr/bin/env bun
/**
 * ralph-check-plan.ts
 *
 * Claude Code Stop hook script for the Ralph loop mechanism.
 * Called on every session stop event. Checks for a ralph-state.md file and
 * decides whether to allow the session to stop or to continue the loop.
 *
 * Exit 0  → allow session to stop
 * Stdout JSON with decision:block → continue the loop (re-inject prompt)
 */

import { existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

interface StopHookInput {
  session_id?: string;
  hook_event_name?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

interface BlockDecision {
  decision: "block";
  reason: string;
  systemMessage: string;
}

function parseFrontmatter(text: string): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      const cleaned = value.trim().replace(/^"(.*)"$/, "$1");
      result[key] = isNaN(Number(cleaned)) ? cleaned : Number(cleaned);
    }
  }
  return result;
}

function updateFrontmatter(
  content: string,
  updates: Record<string, string | number>
): string {
  const parts = content.split("---\n");
  if (parts.length < 3) return content;
  let fm = parts[1];
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}:.*$`, "m");
    if (regex.test(fm)) {
      fm = fm.replace(regex, `${key}: ${value}`);
    } else {
      // Field doesn't exist — append it
      fm = fm.trimEnd() + `\n${key}: ${value}\n`;
    }
  }
  parts[1] = fm;
  return parts.join("---\n");
}

/**
 * Find all ralph-state.md files under .workflow-adapter/
 * Uses manual directory scan for cross-platform compatibility (Bun.Glob
 * has known issues with glob patterns on Windows).
 */
function findRalphStateFiles(base: string = ".workflow-adapter"): string[] {
  if (!existsSync(base)) return [];
  try {
    const subdirs = readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const result: string[] = [];
    for (const subdir of subdirs) {
      const stateFile = join(base, subdir, "ralph-state.md");
      if (existsSync(stateFile)) {
        result.push(stateFile);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function safeDelete(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // ignore delete errors
  }
}

// Use top-level await (required for Bun.stdin.text() to work correctly on Windows)
try {
  // Read stdin JSON from Claude Code Stop hook
  const text = await Bun.stdin.text();
  let input: StopHookInput = {};
  if (text.trim()) {
    try {
      input = JSON.parse(text);
    } catch {
      // Malformed stdin — allow stop
      process.exit(0);
    }
  }

  const lastMsg: string = input.last_assistant_message ?? "";
  const stopHookActive: boolean = input.stop_hook_active ?? false; // extracted per criterion #3; available for future use

  // Find ralph-state.md files
  const files = findRalphStateFiles(".workflow-adapter");

  if (files.length === 0) {
    // No active Ralph loop — allow session to stop
    process.exit(0);
  }

  const currentSessionId: string | undefined = input.session_id;

  // Iterate all state files to find the one owned by (or claimable by) this session
  let matchedStatePath: string | null = null;
  let matchedContent: string | null = null;
  let matchedFrontmatter: Record<string, string | number> | null = null;
  let matchedBody: string | null = null;

  for (const stateFilePath of files) {
    let content: string;
    try {
      content = await Bun.file(stateFilePath).text();
    } catch {
      continue;
    }

    const parts = content.split("---\n");
    if (parts.length < 3) {
      process.stderr.write(
        `[ralph] WARNING: Corrupted state file (missing frontmatter): ${stateFilePath}. Deleting.\n`
      );
      safeDelete(stateFilePath);
      continue;
    }

    const frontmatter = parseFrontmatter(parts[1]);

    // Validate required fields
    const requiredFields = ["iteration", "max_iterations", "completion_promise"];
    let corrupted = false;
    for (const field of requiredFields) {
      if (frontmatter[field] === undefined || frontmatter[field] === "") {
        process.stderr.write(
          `[ralph] WARNING: Corrupted state file (missing field '${field}'): ${stateFilePath}. Deleting.\n`
        );
        safeDelete(stateFilePath);
        corrupted = true;
        break;
      }
    }
    if (corrupted) continue;

    if (isNaN(Number(frontmatter.iteration)) || isNaN(Number(frontmatter.max_iterations))) {
      process.stderr.write(
        `[ralph] WARNING: Corrupted state file (non-numeric iteration fields): ${stateFilePath}. Deleting.\n`
      );
      safeDelete(stateFilePath);
      continue;
    }

    const storedSessionId = frontmatter.session_id
      ? String(frontmatter.session_id)
      : null;

    // Session isolation: skip files owned by a different session
    if (storedSessionId && currentSessionId && storedSessionId !== currentSessionId) {
      continue;
    }

    // This file is either owned by this session or unbound — claim it
    matchedStatePath = stateFilePath;
    matchedContent = content;
    matchedFrontmatter = frontmatter;
    matchedBody = parts.slice(2).join("---\n").trim();
    break;
  }

  if (!matchedStatePath || !matchedContent || !matchedFrontmatter || !matchedBody) {
    // No state file matched this session — allow stop
    process.exit(0);
  }

  const iteration = Number(matchedFrontmatter.iteration);
  const maxIterations = Number(matchedFrontmatter.max_iterations);
  const completionPromise = String(matchedFrontmatter.completion_promise);
  const storedSessionId = matchedFrontmatter.session_id
    ? String(matchedFrontmatter.session_id)
    : null;

  // Check if orchestrator signalled completion via promise tag
  const completionTag = `<promise>${completionPromise}</promise>`;
  if (lastMsg.includes(completionTag)) {
    // Loop is complete — delete state file and allow stop
    safeDelete(matchedStatePath);
    process.exit(0);
  }

  // Check if max iterations reached
  if (iteration >= maxIterations) {
    process.stderr.write(
      `[ralph] WARNING: Max iterations (${maxIterations}) reached for state file: ${matchedStatePath}. Stopping loop.\n`
    );
    safeDelete(matchedStatePath);
    process.exit(0);
  }

  // Increment iteration and update state file, binding session_id on first stop
  const newIteration = iteration + 1;
  const updates: Record<string, string | number> = { iteration: newIteration };
  if (!storedSessionId && currentSessionId) {
    updates.session_id = currentSessionId;
  }
  const updatedContent = updateFrontmatter(matchedContent, updates);

  try {
    await Bun.write(matchedStatePath, updatedContent);
  } catch (err) {
    process.stderr.write(
      `[ralph] WARNING: Failed to update state file: ${matchedStatePath}. ${err}\n`
    );
    process.exit(0);
  }

  // Build block decision to re-inject the orchestrator prompt
  const blockOutput: BlockDecision = {
    decision: "block",
    reason: matchedBody,
    systemMessage: `🔄 Ralph iteration ${newIteration}/${maxIterations}`,
  };

  process.stdout.write(JSON.stringify(blockOutput));
} catch (err) {
  // Catch-all: any unexpected error — allow session to stop gracefully
  process.stderr.write(
    `[ralph] ERROR: Unexpected error in ralph-check-plan.ts: ${err}\n`
  );
  process.exit(0);
}
