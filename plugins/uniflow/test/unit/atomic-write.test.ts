import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, atomicWriteJSON, appendJSONL } from "../../src/lib/atomic-write.js";
import { createTempDir, type TempDir } from "../helpers/temp-project.js";

describe("atomicWrite", () => {
  let tmp: TempDir;

  beforeAll(async () => {
    tmp = await createTempDir("uniflow-atomic-");
  });

  afterAll(async () => {
    await tmp.cleanup();
  });

  it("writes file with correct content", async () => {
    const p = join(tmp.path, "test.txt");
    await atomicWrite(p, "hello world");
    expect(await readFile(p, "utf-8")).toBe("hello world");
  });

  it("creates parent directories", async () => {
    const p = join(tmp.path, "deep", "nested", "file.txt");
    await atomicWrite(p, "nested");
    expect(await readFile(p, "utf-8")).toBe("nested");
  });

  it("no .tmp files remain after write", async () => {
    const p = join(tmp.path, "clean.txt");
    await atomicWrite(p, "data");
    const files = await readdir(tmp.path);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles.length).toBe(0);
  });

  it("overwrites existing file", async () => {
    const p = join(tmp.path, "overwrite.txt");
    await atomicWrite(p, "first");
    await atomicWrite(p, "second");
    expect(await readFile(p, "utf-8")).toBe("second");
  });
});

describe("atomicWriteJSON", () => {
  let tmp: TempDir;

  beforeAll(async () => {
    tmp = await createTempDir("uniflow-json-");
  });

  afterAll(async () => {
    await tmp.cleanup();
  });

  it("writes pretty-printed JSON with trailing newline", async () => {
    const p = join(tmp.path, "data.json");
    await atomicWriteJSON(p, { key: "value" });
    const content = await readFile(p, "utf-8");
    expect(content).toEndWith("\n");
    expect(JSON.parse(content)).toEqual({ key: "value" });
  });

  it("result is parseable JSON matching input", async () => {
    const p = join(tmp.path, "complex.json");
    const data = { arr: [1, 2], nested: { a: true } };
    await atomicWriteJSON(p, data);
    expect(JSON.parse(await readFile(p, "utf-8"))).toEqual(data);
  });
});

describe("appendJSONL", () => {
  let tmp: TempDir;

  beforeAll(async () => {
    tmp = await createTempDir("uniflow-jsonl-");
  });

  afterAll(async () => {
    await tmp.cleanup();
  });

  it("appends single line to new file", async () => {
    const p = join(tmp.path, "out.jsonl");
    await appendJSONL(p, { id: 1 });
    const content = await readFile(p, "utf-8");
    expect(content.trim()).toBe('{"id":1}');
  });

  it("appends multiple lines", async () => {
    const p = join(tmp.path, "multi.jsonl");
    await appendJSONL(p, { id: 1 });
    await appendJSONL(p, { id: 2 });
    const lines = (await readFile(p, "utf-8")).trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ id: 1 });
    expect(JSON.parse(lines[1])).toEqual({ id: 2 });
  });

  it("creates parent directory if missing", async () => {
    const p = join(tmp.path, "sub", "dir", "log.jsonl");
    await appendJSONL(p, { ok: true });
    expect(JSON.parse(await readFile(p, "utf-8"))).toEqual({ ok: true });
  });
});
