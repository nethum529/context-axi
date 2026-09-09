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

describe("resolveTranscript session identity", () => {
  let home: string;
  let originalHome: string | undefined;
  const cwd = "/workspace/multi-session";

  const claudeDir = () => join(home, ".claude", "projects", encodeCwd(cwd));

  function writeClaudeSession(id: string, mtime: Date): string {
    const path = join(claudeDir(), `${id}.jsonl`);
    writeFileSync(path, "{}\n");
    utimesSync(path, mtime, mtime);
    return path;
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "context-axi-identity-"));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    delete process.env.CLAUDE_CODE_SESSION_ID;
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CONTEXT_AXI_NO_ENV_SESSION;
    delete process.env.CONTEXT_AXI_LIVE_WINDOW_SECONDS;
    mkdirSync(claudeDir(), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    delete process.env.CLAUDE_CODE_SESSION_ID;
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CONTEXT_AXI_NO_ENV_SESSION;
    delete process.env.CONTEXT_AXI_LIVE_WINDOW_SECONDS;
    rmSync(home, { recursive: true, force: true });
  });

  it("uses CLAUDE_CODE_SESSION_ID instead of the newest transcript", () => {
    const mine = writeClaudeSession("mine", new Date(Date.now() - 60_000));
    writeClaudeSession("busy-neighbour", new Date());
    process.env.CLAUDE_CODE_SESSION_ID = "mine";

    expect(resolveTranscript({ cwd })).toEqual({
      ok: true,
      transcript: mine,
      sessionId: "mine",
      harness: "claude",
    });
  });

  it("ignores an env session whose transcript is not in this cwd", () => {
    const only = writeClaudeSession("only", new Date());
    process.env.CLAUDE_CODE_SESSION_ID = "session-from-another-project";

    expect(resolveTranscript({ cwd })).toEqual({
      ok: true,
      transcript: only,
      sessionId: "only",
      harness: "claude",
    });
  });

  it("honors CONTEXT_AXI_NO_ENV_SESSION", () => {
    writeClaudeSession("mine", new Date(Date.now() - 60_000));
    writeClaudeSession("newest", new Date());
    process.env.CLAUDE_CODE_SESSION_ID = "mine";
    process.env.CONTEXT_AXI_NO_ENV_SESSION = "1";

    const result = resolveTranscript({ cwd });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ambiguous_session");
  });

  it("fails loudly when two sessions in the cwd are both active", () => {
    writeClaudeSession("session-a", new Date());
    writeClaudeSession("session-b", new Date());

    const result = resolveTranscript({ cwd });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ambiguous_session");
      expect(result.error.message).toContain("session-a");
      expect(result.error.message).toContain("session-b");
    }
  });

  it("still picks the newest when the other session is stale", () => {
    writeClaudeSession("stale", new Date(Date.now() - 86_400_000));
    const active = writeClaudeSession("active", new Date());

    expect(resolveTranscript({ cwd })).toEqual({
      ok: true,
      transcript: active,
      sessionId: "active",
      harness: "claude",
    });
  });

  it("CONTEXT_AXI_LIVE_WINDOW_SECONDS=0 restores newest-wins behavior", () => {
    writeClaudeSession("older", new Date(Date.now() - 60_000));
    const newest = writeClaudeSession("newest", new Date());
    process.env.CONTEXT_AXI_LIVE_WINDOW_SECONDS = "0";

    expect(resolveTranscript({ cwd })).toEqual({
      ok: true,
      transcript: newest,
      sessionId: "newest",
      harness: "claude",
    });
  });

  it("an explicit --session always wins over the environment", () => {
    writeClaudeSession("env-one", new Date());
    const asked = writeClaudeSession("asked-for", new Date());
    process.env.CLAUDE_CODE_SESSION_ID = "env-one";

    expect(resolveTranscript({ cwd, session: "asked-for" })).toEqual({
      ok: true,
      transcript: asked,
      sessionId: "asked-for",
      harness: "claude",
    });
  });
});
