import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { agentsDir, inboxesDir, sessionDir, tasksDir } from "../lib/constants.js";
import type { CliType, WorkerMode } from "../lib/types.js";
import { buildClaudeCommand, prepareClaude } from "./claude.js";
import { buildCodexCommand, prepareCodex } from "./codex.js";

// ── Template Variables ────────────────────────────────────────────────

export interface TemplateVars {
  PROJECT_NAME: string;
  SESSION_ID: string;
  STATE_DIR: string;
  WORKER_NAME?: string;
  ROLE?: string;
  INBOX_PATH?: string;
  AGENT_STATUS_PATH?: string;
  OUTBOX_PATH?: string;
  TASKS_DIR?: string;
  CLI?: string;
  PANE_ID?: string;
  PID?: string;
  STARTED_AT?: string;
  ROLE_INSTRUCTIONS?: string;
}

// ── Launch Options ────────────────────────────────────────────────────

export interface LaunchOptions {
  name: string;
  cli: CliType;
  role: string;
  mode: WorkerMode;
  cwd: string;
  instructionPath: string;
  pluginDir?: string;
  initialPrompt?: string;
}

// ── Template Rendering ────────────────────────────────────────────────

/**
 * Replace all {{VAR}} placeholders in a template string with values from vars.
 * Unmatched placeholders are left as-is.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Load a role instruction file from src/templates/roles/{role}.md.
 * Returns the file content if it exists, or an empty string for unknown roles.
 */
export async function loadRoleInstructions(role: string): Promise<string> {
  const rolePath = join(dirname(import.meta.dir), "templates", "roles", `${role}.md`);
  try {
    return await readFile(rolePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Load a template file from src/templates/ and render it with the given variables.
 * For worker templates, automatically loads role instructions if not already provided.
 */
export async function loadAndRenderTemplate(
  templateName: "orchestrator" | "worker",
  vars: TemplateVars,
): Promise<string> {
  const templatePath = join(dirname(import.meta.dir), "templates", `${templateName}.md`);
  const template = await readFile(templatePath, "utf-8");

  // Auto-load role instructions for workers if not explicitly provided
  if (templateName === "worker" && !vars.ROLE_INSTRUCTIONS && vars.ROLE) {
    vars.ROLE_INSTRUCTIONS = await loadRoleInstructions(vars.ROLE);
  }

  return renderTemplate(template, vars);
}

// ── Variable Helpers ──────────────────────────────────────────────────

/**
 * Build orchestrator template variables from session info.
 */
export function buildOrchestratorVars(projectName: string, sessionId: string): TemplateVars {
  return {
    PROJECT_NAME: projectName,
    SESSION_ID: sessionId,
    STATE_DIR: sessionDir(projectName, sessionId),
  };
}

/**
 * Build worker template variables from session + agent info.
 */
export function buildWorkerVars(
  projectName: string,
  sessionId: string,
  workerName: string,
  cli: CliType,
  role: string,
  paneId: string,
  pid: number,
  roleInstructions?: string,
): TemplateVars {
  const sd = sessionDir(projectName, sessionId);
  return {
    PROJECT_NAME: projectName,
    SESSION_ID: sessionId,
    STATE_DIR: sd,
    WORKER_NAME: workerName,
    ROLE: role,
    CLI: cli,
    PANE_ID: paneId,
    PID: String(pid),
    STARTED_AT: new Date().toISOString(),
    INBOX_PATH: join(inboxesDir(projectName, sessionId), `${workerName}.md`),
    AGENT_STATUS_PATH: join(agentsDir(projectName, sessionId), `${workerName}.json`),
    OUTBOX_PATH: join(sd, "outbox.jsonl"),
    TASKS_DIR: tasksDir(projectName, sessionId),
    ROLE_INSTRUCTIONS: roleInstructions ?? "",
  };
}

// ── Launch Command Builder ────────────────────────────────────────────

/**
 * Build the CLI launch command for an agent.
 * Returns an array of command + arguments suitable for Bun.spawn.
 */
export function buildLaunchCommand(opts: LaunchOptions): string[] {
  switch (opts.cli) {
    case "claude":
      return buildClaudeCommand(opts);
    case "codex":
      return buildCodexCommand(opts);
    default:
      throw new Error(`Unsupported CLI: ${opts.cli}`);
  }
}

/**
 * Prepare the environment for launching an agent.
 * Creates pre-trust directories, writes instruction files, etc.
 */
export async function prepareLaunch(opts: LaunchOptions): Promise<void> {
  switch (opts.cli) {
    case "claude":
      return prepareClaude(opts);
    case "codex":
      return prepareCodex(opts);
    default:
      throw new Error(`Unsupported CLI: ${opts.cli}`);
  }
}
