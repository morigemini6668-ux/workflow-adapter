import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectDir, UNIFLOW_ID_FILE } from "../lib/constants.js";

const ADJECTIVES = [
  "brave",
  "calm",
  "dark",
  "eager",
  "fair",
  "glad",
  "keen",
  "mild",
  "neat",
  "pale",
  "rare",
  "safe",
  "tall",
  "vast",
  "warm",
  "wise",
  "bold",
  "cool",
  "fast",
  "good",
  "loud",
  "pure",
  "rich",
  "soft",
  "wild",
  "deep",
  "free",
  "grey",
  "lean",
  "slow",
  "true",
  "wide",
];

const NOUNS = [
  "falcon",
  "tiger",
  "cedar",
  "river",
  "stone",
  "cloud",
  "flame",
  "frost",
  "grove",
  "haven",
  "ridge",
  "storm",
  "trail",
  "brook",
  "crane",
  "drift",
  "flint",
  "glade",
  "marsh",
  "pearl",
  "raven",
  "shade",
  "spark",
  "thorn",
  "ember",
  "birch",
  "coral",
  "delta",
  "forge",
  "lotus",
  "nexus",
  "orbit",
];

function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

export async function findProjectRoot(cwd: string = process.cwd()): Promise<string | null> {
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, UNIFLOW_ID_FILE))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function readProjectName(root: string): Promise<string> {
  const content = await readFile(join(root, UNIFLOW_ID_FILE), "utf-8");
  return content.trim();
}

export async function ensureInit(): Promise<{ root: string; projectName: string }> {
  const existing = await findProjectRoot();
  if (existing) {
    const projectName = await readProjectName(existing);
    return { root: existing, projectName };
  }

  // Auto-init in cwd
  const root = process.cwd();
  const projectName = generateName();
  await writeFile(join(root, UNIFLOW_ID_FILE), `${projectName}\n`, "utf-8");
  await mkdir(projectDir(projectName), { recursive: true });
  console.log(`Auto-initialized project: ${projectName}`);
  return { root, projectName };
}

export default async function init(_args: string[]): Promise<void> {
  const existing = await findProjectRoot();

  if (existing) {
    const name = await readProjectName(existing);
    console.log(`Project already initialized: ${name} (${join(existing, UNIFLOW_ID_FILE)})`);
    return;
  }

  const projectName = generateName();
  const idPath = join(process.cwd(), UNIFLOW_ID_FILE);

  await writeFile(idPath, `${projectName}\n`, "utf-8");
  await mkdir(projectDir(projectName), { recursive: true });

  console.log(`Initialized project: ${projectName}`);
  console.log(`  ID file: ${idPath}`);
  console.log(`  State dir: ${projectDir(projectName)}`);
}
