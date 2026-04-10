import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "./client.js";

const CLAUDE_PLUGINS_DIR = join(homedir(), ".claude", "plugins");
const CODEX_SKILLS_DIR = join(homedir(), ".agents", "skills");
const VALID_PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;

function validatePluginName(name: string): void {
  if (!VALID_PLUGIN_NAME.test(name)) {
    console.error(
      `Invalid plugin name: "${name}". Only lowercase letters, numbers, and hyphens allowed.`,
    );
    process.exit(1);
  }
}

function pluginInstallDir(name: string): string {
  return join(CLAUDE_PLUGINS_DIR, `uniflow-${name}`);
}

/** Scan skills/ subdirectories and return skill names (dirs containing SKILL.md). */
async function scanSkills(pluginDir: string): Promise<string[]> {
  const skillsDir = join(pluginDir, "skills");
  if (!existsSync(skillsDir)) return [];
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: string[] = [];
  for (const e of entries) {
    if (e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))) {
      skills.push(e.name);
    }
  }
  return skills;
}

// ── Create ──────────────────────────────────────────────────────────

async function createPlugin(name: string): Promise<void> {
  const dir = resolve(name);
  if (existsSync(dir)) {
    console.error(`Directory already exists: ${dir}`);
    process.exit(1);
  }

  const pluginJsonDir = join(dir, ".claude-plugin");
  const skillsDir = join(dir, "skills");
  const agentsDir = join(dir, "agents");

  await mkdir(pluginJsonDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  await writeFile(
    join(pluginJsonDir, "plugin.json"),
    `${JSON.stringify(
      {
        name,
        description: `${name} — uniflow native plugin`,
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const sampleSkillDir = join(skillsDir, "default");
  await mkdir(sampleSkillDir, { recursive: true });
  await writeFile(
    join(sampleSkillDir, "SKILL.md"),
    `---
description: >
  Sample skill for ${name}. Requires a running uniflow session.
  Trigger: "run ${name}", "${name} 실행"
allowed-tools: [Bash, Read, Write, Glob, Grep]
---

# ${name} — Default Workflow

## Phase 1: Agent Spawn
1. \`uniflow spawn worker-1 --role executor\`

## Phase 2: Execute
- \`uniflow task-add "TODO: define task" --assign worker-1\`
- Monitor with \`uniflow status\`

## Phase 3: Cleanup
- Collect results and generate report
`,
    "utf-8",
  );

  await writeFile(
    join(agentsDir, "sample-agent.md"),
    `You are a **sample agent** in a uniflow ${name} session.

**Core Responsibilities:**
1. Execute assigned tasks
2. Report results to outbox
`,
    "utf-8",
  );

  console.log(`Created plugin: ${dir}`);
  console.log("  .claude-plugin/plugin.json");
  console.log("  skills/default/SKILL.md");
  console.log("  agents/sample-agent.md");
  console.log(`\nNext: edit skills/agents, then run "uniflow plugin install ./${name}"`);
}

// ── List ────────────────────────────────────────────────────────────

async function listPlugins(json: boolean): Promise<void> {
  if (!existsSync(CLAUDE_PLUGINS_DIR)) {
    if (json) {
      console.log("[]");
    } else {
      console.log("No plugins installed.");
    }
    return;
  }

  const entries = await readdir(CLAUDE_PLUGINS_DIR, { withFileTypes: true });
  const uniflowPlugins = entries.filter(
    (e) => (e.isDirectory() || e.isSymbolicLink()) && e.name.startsWith("uniflow-"),
  );

  if (uniflowPlugins.length === 0) {
    if (json) {
      console.log("[]");
    } else {
      console.log("No uniflow plugins installed.");
    }
    return;
  }

  const results: {
    name: string;
    version: string;
    description: string;
    path: string;
    skills: string[];
    target: string;
  }[] = [];

  for (const entry of uniflowPlugins) {
    const name = entry.name.replace(/^uniflow-/, "");
    const pluginPath = join(CLAUDE_PLUGINS_DIR, entry.name);
    const pluginJsonPath = join(pluginPath, ".claude-plugin", "plugin.json");
    let version = "0.0.0";
    let description = "";
    try {
      const manifest = JSON.parse(await readFile(pluginJsonPath, "utf-8"));
      version = manifest.version ?? "0.0.0";
      description = manifest.description ?? "";
    } catch {
      // plugin.json might not exist
    }
    const skills = await scanSkills(pluginPath);
    const codexInstalled = skills.some((s) =>
      existsSync(join(CODEX_SKILLS_DIR, `uniflow-${name}-${s}`)),
    );
    const target = codexInstalled ? "both" : "claude";

    results.push({ name, version, description, path: pluginPath, skills, target });
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("Installed uniflow plugins:\n");
    for (const p of results) {
      console.log(`  ${p.name}@${p.version}  ${p.description}`);
      if (p.skills.length > 0) {
        console.log(`    skills: ${p.skills.join(", ")}  [target: ${p.target}]`);
      }
    }
  }
}

// ── Codex Conversion ────────────────────────────────────────────────

async function convertAndInstallCodex(sourcePath: string, pluginName: string): Promise<void> {
  const skills = await scanSkills(sourcePath);
  if (skills.length === 0) return;

  for (const skillName of skills) {
    const codexSkillDir = join(CODEX_SKILLS_DIR, `uniflow-${pluginName}-${skillName}`);
    try {
      await mkdir(codexSkillDir, { recursive: true });

      // Copy SKILL.md with frontmatter stripped
      const skillMdPath = join(sourcePath, "skills", skillName, "SKILL.md");
      let content = await readFile(skillMdPath, "utf-8");
      // Strip YAML frontmatter (--- ... ---)
      const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
      if (frontmatterMatch) {
        content = content.slice(frontmatterMatch[0].length);
      }
      await writeFile(join(codexSkillDir, "SKILL.md"), content, "utf-8");

      // Copy references/ if exists
      const refsDir = join(sourcePath, "skills", skillName, "references");
      if (existsSync(refsDir)) {
        const codexRefsDir = join(codexSkillDir, "references");
        await cp(refsDir, codexRefsDir, { recursive: true });
      }
    } catch (err) {
      console.warn(
        `  Warning: Codex conversion failed for skill "${skillName}": ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  console.log(`  Codex: ${skills.length} skill(s) installed to ~/.agents/skills/`);
}

async function removeCodexSkills(pluginName: string): Promise<void> {
  if (!existsSync(CODEX_SKILLS_DIR)) return;
  const entries = await readdir(CODEX_SKILLS_DIR, { withFileTypes: true });
  const prefix = `uniflow-${pluginName}-`;
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith(prefix)) {
      await rm(join(CODEX_SKILLS_DIR, e.name), { recursive: true, force: true });
    }
  }
}

// ── Install ─────────────────────────────────────────────────────────

async function installPlugin(sourcePath: string, link: boolean, force: boolean): Promise<void> {
  const absSource = resolve(sourcePath);
  if (!existsSync(absSource)) {
    console.error(`Source directory not found: ${absSource}`);
    process.exit(1);
  }

  // Validate plugin.json
  const pluginJsonPath = join(absSource, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginJsonPath)) {
    console.error(`Not a valid plugin: ${pluginJsonPath} not found`);
    process.exit(1);
  }

  let pluginName: string;
  try {
    const json = JSON.parse(await readFile(pluginJsonPath, "utf-8"));
    pluginName = json.name;
    if (!pluginName) throw new Error("name field missing");
    validatePluginName(pluginName);
  } catch (err) {
    console.error(`Invalid plugin.json: ${err instanceof Error ? err.message : "parse error"}`);
    process.exit(1);
  }

  // Validate skills/ directory
  const skills = await scanSkills(absSource);
  if (skills.length === 0) {
    console.error(
      "Plugin has no skills: skills/ directory is missing or contains no SKILL.md files",
    );
    process.exit(1);
  }

  const destDir = pluginInstallDir(pluginName);

  // Overwrite confirmation (D20)
  if (existsSync(destDir) && !force) {
    console.error(`Plugin "${pluginName}" is already installed at ${destDir}`);
    console.error("Use --force to overwrite the existing installation.");
    process.exit(1);
  }

  if (existsSync(destDir)) {
    await rm(destDir, { recursive: true, force: true });
  }

  await mkdir(CLAUDE_PLUGINS_DIR, { recursive: true });

  if (link) {
    await symlink(absSource, destDir, "dir");
    console.log(`Linked: ${destDir} -> ${absSource}`);
  } else {
    await cp(absSource, destDir, { recursive: true });
    console.log(`Installed: ${destDir}`);
  }

  // Codex dual-format install (D11, D21)
  try {
    await convertAndInstallCodex(absSource, pluginName);
  } catch {
    console.warn("  Warning: Codex conversion failed (Claude Code install succeeded)");
  }

  console.log(
    `Plugin "${pluginName}" is now available (${skills.length} skill(s): ${skills.join(", ")}).`,
  );
}

// ── Remove ──────────────────────────────────────────────────────────

async function removePlugin(name: string): Promise<void> {
  validatePluginName(name);
  const destDir = pluginInstallDir(name);
  if (!existsSync(destDir)) {
    console.error(`Plugin not installed: ${name}`);
    process.exit(1);
  }

  await rm(destDir, { recursive: true, force: true });
  await removeCodexSkills(name);
  console.log(`Removed plugin: ${name}`);
}

// ── Entry Point ─────────────────────────────────────────────────────

export default async function plugin(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const subcommand = positional[0];

  if (!subcommand) {
    console.error("Usage: uniflow plugin <create|list|install|remove> [options]");
    console.error("");
    console.error("  create <name>            Scaffold a new plugin directory");
    console.error("  list [--json]            List installed uniflow plugins");
    console.error("  install <path> [--link] [--force]  Install plugin");
    console.error("  remove <name>            Remove an installed plugin");
    process.exit(1);
  }

  switch (subcommand) {
    case "create": {
      const name = positional[1];
      if (!name) {
        console.error("Usage: uniflow plugin create <name>");
        process.exit(1);
      }
      await createPlugin(name);
      break;
    }
    case "list":
      await listPlugins(flags.json === true);
      break;
    case "install": {
      const path = positional[1];
      if (!path) {
        console.error("Usage: uniflow plugin install <path> [--link] [--force]");
        process.exit(1);
      }
      await installPlugin(path, flags.link === true, flags.force === true);
      break;
    }
    case "remove": {
      const name = positional[1];
      if (!name) {
        console.error("Usage: uniflow plugin remove <name>");
        process.exit(1);
      }
      await removePlugin(name);
      break;
    }
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error("Available: create, list, install, remove");
      process.exit(1);
  }
}
