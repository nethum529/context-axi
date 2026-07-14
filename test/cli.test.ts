import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

class MemoryStdout {
  chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  toString(): string {
    return this.chunks.join("");
  }
}

describe("cli error path", () => {
  let home: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "context-axi-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  it("exits 1 with a structured error when no projects dir exists", async () => {
    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--cwd", "/nowhere"], stdout, stderr);
    expect(code).toBe(1);
    const parsed = JSON.parse(stderr.toString());
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe("no_projects_dir");
  });

  it("exits 1 with a structured error when no transcripts exist for the cwd", async () => {
    mkdirSync(join(home, ".claude", "projects"), { recursive: true });
    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--cwd", "/nowhere"], stdout, stderr);
    expect(code).toBe(1);
    const parsed = JSON.parse(stderr.toString());
    expect(parsed.code).toBe("no_transcripts");
  });

  it("exits 2 on unknown flag", async () => {
    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--bogus"], stdout, stderr);
    expect(code).toBe(2);
    const parsed = JSON.parse(stderr.toString());
    expect(parsed.error).toBe(true);
  });

  it("reports percentUsed via --json for a real transcript", async () => {
    const dir = join(home, ".claude", "projects", "-tmp-proj");
    mkdirSync(dir, { recursive: true });
    const transcriptPath = join(dir, "session1.jsonl");
    writeFileSync(
      transcriptPath,
      [
        line({
          type: "assistant",
          message: {
            model: "claude-opus-4-8",
            usage: {
              input_tokens: 1000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 99000,
            },
          },
        }),
      ].join("\n"),
    );

    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--cwd", "/tmp/proj", "--json"], stdout, stderr);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.toString());
    expect(parsed.tokensUsed).toBe(100000);
    expect(parsed.percentUsed).toBe(10); // 100k of the 1M opus-4-8 window
    expect(parsed.windowSource).toBe("model");
  });

  it("detects a Codex rollout passed through --transcript", async () => {
    const rollout = fileURLToPath(
      new URL(
        "./fixtures/rollout-2026-07-13T00-00-00-00000000-0000-0000-0000-000000000000.jsonl",
        import.meta.url,
      ),
    );
    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--transcript", rollout, "--json"], stdout, stderr);

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(JSON.parse(stdout.toString())).toEqual({
      percentUsed: 18,
      tokensUsed: 48000,
      window: 272000,
      windowSource: "default",
      model: "gpt-5.6-terra",
      sessionId: "codex-fixture-session",
      transcript: rollout,
    });
  });

  it("accepts --harness codex for an explicit rollout", async () => {
    const rollout = fileURLToPath(
      new URL(
        "./fixtures/rollout-2026-07-13T00-00-00-00000000-0000-0000-0000-000000000000.jsonl",
        import.meta.url,
      ),
    );
    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(
      ["--harness", "codex", "--transcript", rollout, "--json"],
      stdout,
      stderr,
    );

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(JSON.parse(stdout.toString()).window).toBe(272000);
  });

  it("exits 1 with a structured error when --transcript points at a directory (EISDIR)", async () => {
    const dirAsTranscript = join(home, "not-a-file");
    mkdirSync(dirAsTranscript, { recursive: true });

    const stdout = new MemoryStdout();
    const stderr = new MemoryStdout();
    const code = await main(["--transcript", dirAsTranscript], stdout, stderr);
    expect(code).toBe(1);
    const parsed = JSON.parse(stderr.toString());
    expect(parsed.error).toBe(true);
    expect(typeof parsed.message).toBe("string");
  });
});
