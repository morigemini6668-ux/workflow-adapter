import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePluginName, scanSkills } from "../../src/cli/plugin.js";
import { createTempDir, type TempDir } from "../helpers/temp-project.js";

// validatePluginName calls process.exit(1) on failure.
// We test the regex directly to avoid process.exit in tests.
const VALID_PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;

describe("plugin name validation (regex)", () => {
  it("accepts lowercase letters", () => {
    expect(VALID_PLUGIN_NAME.test("brainstorming")).toBe(true);
  });

  it("accepts letters with hyphens", () => {
    expect(VALID_PLUGIN_NAME.test("my-plugin")).toBe(true);
  });

  it("accepts letters with numbers", () => {
    expect(VALID_PLUGIN_NAME.test("plugin2")).toBe(true);
  });

  it("accepts number start", () => {
    expect(VALID_PLUGIN_NAME.test("3d-viewer")).toBe(true);
  });

  it("rejects path traversal ../", () => {
    expect(VALID_PLUGIN_NAME.test("../evil")).toBe(false);
  });

  it("rejects slashes", () => {
    expect(VALID_PLUGIN_NAME.test("foo/bar")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(VALID_PLUGIN_NAME.test("")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(VALID_PLUGIN_NAME.test("MyPlugin")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(VALID_PLUGIN_NAME.test("my plugin")).toBe(false);
  });

  it("rejects starting with hyphen", () => {
    expect(VALID_PLUGIN_NAME.test("-bad")).toBe(false);
  });

  it("rejects dots", () => {
    expect(VALID_PLUGIN_NAME.test("my.plugin")).toBe(false);
  });
});

describe("scanSkills", () => {
  let tmp: TempDir;

  beforeAll(async () => {
    tmp = await createTempDir("uniflow-plugin-test-");
  });

  afterAll(async () => {
    await tmp.cleanup();
  });

  it("returns empty for missing skills/ dir", async () => {
    const skills = await scanSkills(tmp.path);
    expect(skills).toEqual([]);
  });

  it("returns empty for skills/ with no SKILL.md", async () => {
    const skillDir = join(tmp.path, "skills", "empty-skill");
    await mkdir(skillDir, { recursive: true });
    const skills = await scanSkills(tmp.path);
    expect(skills).toEqual([]);
  });

  it("detects skill with SKILL.md", async () => {
    const skillDir = join(tmp.path, "skills", "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: brainstorming\n---\n");
    const skills = await scanSkills(tmp.path);
    expect(skills).toContain("brainstorming");
  });

  it("detects multiple skills", async () => {
    const skill2Dir = join(tmp.path, "skills", "review");
    await mkdir(skill2Dir, { recursive: true });
    await writeFile(join(skill2Dir, "SKILL.md"), "---\nname: review\n---\n");
    const skills = await scanSkills(tmp.path);
    expect(skills).toContain("brainstorming");
    expect(skills).toContain("review");
    expect(skills.length).toBe(2);
  });
});
