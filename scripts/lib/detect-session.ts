import { existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

/**
 * Detect the current session_id from the most recent transcript file.
 * Claude Code stores transcripts as {session_id}.jsonl under ~/.claude/projects/{hash}/
 */
export function detectSessionId(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const projectsDir = join(home, ".claude", "projects");
  if (!existsSync(projectsDir)) return null;

  const cwdName = basename(process.cwd());
  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.includes(cwdName))
      .map((d) => join(projectsDir, d.name));

    if (projectDirs.length === 0) return null;

    let newestFile: string | null = null;
    let newestTime = 0;

    for (const dir of projectDirs) {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => join(dir, f));
      for (const f of files) {
        try {
          const st = statSync(f);
          if (st.mtimeMs > newestTime) {
            newestTime = st.mtimeMs;
            newestFile = f;
          }
        } catch {
          // skip
        }
      }
    }

    if (!newestFile) return null;
    const match = newestFile.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
