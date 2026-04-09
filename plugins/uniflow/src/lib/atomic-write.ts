import { appendFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Atomic write: write to tmp file, then rename to target.
 * Prevents partial reads by other processes.
 */
export async function atomicWrite(path: string, data: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  await Bun.write(tmp, data);
  await rename(tmp, path);
}

/**
 * Atomic JSON write: serialize + atomicWrite.
 */
export async function atomicWriteJSON(path: string, data: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Append a JSONL line using POSIX O_APPEND (atomic for < 4KB).
 */
export async function appendJSONL(path: string, entry: unknown): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  await appendFile(path, line, "utf-8");
}
