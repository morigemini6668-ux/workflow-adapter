import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJSON } from "../lib/atomic-write.js";
import { projectDir, UNIFLOW_CONFIG_PATH } from "../lib/constants.js";
import { type GlobalConfig, GlobalConfigSchema } from "../lib/types.js";

/**
 * Read global config (~/.uniflow/config.json).
 * Returns defaults if file doesn't exist.
 */
export async function readGlobalConfig(): Promise<GlobalConfig> {
  try {
    const raw = await readFile(UNIFLOW_CONFIG_PATH, "utf-8");
    return GlobalConfigSchema.parse(JSON.parse(raw));
  } catch {
    return GlobalConfigSchema.parse({});
  }
}

/**
 * Write global config atomically.
 */
export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await atomicWriteJSON(UNIFLOW_CONFIG_PATH, config);
}

// ── Project Config ────────────────────────────────────────────────────

const ProjectConfigSchema = GlobalConfigSchema.partial();
type ProjectConfig = Partial<GlobalConfig>;

function projectConfigPath(projectName: string): string {
  return join(projectDir(projectName), "config.json");
}

/**
 * Read project-level config overrides.
 * Returns empty object if file doesn't exist.
 */
export async function readProjectConfig(projectName: string): Promise<ProjectConfig> {
  try {
    const raw = await readFile(projectConfigPath(projectName), "utf-8");
    return ProjectConfigSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Write project-level config atomically.
 */
export async function writeProjectConfig(
  projectName: string,
  config: ProjectConfig,
): Promise<void> {
  await atomicWriteJSON(projectConfigPath(projectName), config);
}

/**
 * Resolve effective config: global defaults ← project overrides.
 */
export async function resolveConfig(projectName?: string): Promise<GlobalConfig> {
  const global = await readGlobalConfig();
  if (!projectName) return global;

  const project = await readProjectConfig(projectName);
  return GlobalConfigSchema.parse({ ...global, ...project });
}
