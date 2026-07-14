import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeCwd, resolveTranscript } from "../src/discover.js";

describe("encodeCwd", () => {
  it("replaces slashes with dashes", () => {
    expect(encodeCwd("/home/example/firstmate")).toBe("-home-example-firstmate");
  });

  it("replaces dots with dashes", () => {
    expect(encodeCwd("/home/example/my.project")).toBe("-home-example-my-project");
  });

  it("replaces both slashes and dots together", () => {
    expect(encodeCwd("/home/example/context-axi/v1.0")).toBe(
      "-home-example-context-axi-v1-0",
    );
  });
});

describe("resolveTranscript", () => {
  let home: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "context-axi-discover-"));
    originalHome = process.env.HOME;
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  it("chooses the newest Codex rollout for the cwd in auto mode", () => {
    const cwd = "/workspace/codex-fixture";
    const claudeTranscript = join(
      home,
      ".claude",
      "projects",
      encodeCwd(cwd),
      "claude-session.jsonl",
    );
    const matchingRollout = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "07",
      "13",
      "rollout-2026-07-13T00-00-00-codex-session.jsonl",
    );
    const otherCwdRollout = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "07",
      "13",
      "rollout-2026-07-13T00-00-01-other-session.jsonl",
    );
    const ignoredCodexFile = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "07",
      "13",
      "unrelated.jsonl",
    );

    mkdirSync(join(home, ".claude", "projects", encodeCwd(cwd)), { recursive: true });
    mkdirSync(join(home, ".codex", "sessions", "2026", "07", "13"), { recursive: true });
    writeFileSync(claudeTranscript, "{}\n");
    writeFileSync(
      matchingRollout,
      JSON.stringify({
        type: "session_meta",
        payload: { cwd, session_id: "codex-session" },
      }) + "\n",
    );
    writeFileSync(
      otherCwdRollout,
      JSON.stringify({
        type: "session_meta",
        payload: { cwd: "/workspace/other", session_id: "other-session" },
      }) + "\n",
    );
    writeFileSync(
      ignoredCodexFile,
      JSON.stringify({
        type: "session_meta",
        payload: { cwd, session_id: "ignored-session" },
      }) + "\n",
    );
    utimesSync(claudeTranscript, new Date(1_000), new Date(1_000));
    utimesSync(matchingRollout, new Date(2_000), new Date(2_000));
    utimesSync(otherCwdRollout, new Date(3_000), new Date(3_000));
    utimesSync(ignoredCodexFile, new Date(4_000), new Date(4_000));

    expect(resolveTranscript({ cwd })).toEqual({
      ok: true,
      transcript: matchingRollout,
      sessionId: "codex-session",
      harness: "codex",
    });
  });
});
