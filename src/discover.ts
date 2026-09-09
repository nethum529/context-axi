import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";

export type Harness = "claude" | "codex";
export type HarnessOption = Harness | "auto";

/** Claude Code encodes a project cwd as a directory name by replacing every
 * `/` and `.` with `-`. e.g. /home/example/firstmate -> -home-example-firstmate */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

export function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function projectDir(cwd: string): string {
  return join(projectsRoot(), encodeCwd(cwd));
}

export function codexSessionsRoot(): string {
  return join(homedir(), ".codex", "sessions");
}

export type DiscoveryError = {
  code: "no_projects_dir" | "no_sessions_dir" | "no_transcripts" | "ambiguous_session";
  message: string;
};

export type DiscoveryResult =
  | { ok: true; transcript: string; sessionId: string; harness: Harness }
  | { ok: false; error: DiscoveryError };

type TranscriptCandidate = {
  transcript: string;
  sessionId: string;
  mtimeMs: number;
};

type CandidateLookup =
  | { ok: true; candidate: TranscriptCandidate }
  | { ok: false; error: DiscoveryError };

type CodexDiscoveryMetadata = {
  cwd?: string | undefined;
  sessionId?: string | undefined;
};

function stem(path: string): string {
  const base = basename(path);
  return base.endsWith(".jsonl") ? base.slice(0, -".jsonl".length) : base;
}

/** Default span that counts a transcript as "live" for ambiguity detection. */
const DEFAULT_LIVE_WINDOW_SECONDS = 900;

type EnvSession = { id: string; harness: Harness };

/** Read the session id the running harness exports about itself. Without this
 * a second session in the same cwd is indistinguishable from the caller, and
 * mtime discovery hands back whichever transcript was written last. */
function detectEnvSession(harness: HarnessOption): EnvSession | undefined {
  if (process.env.CONTEXT_AXI_NO_ENV_SESSION === "1") return undefined;

  if (harness !== "codex") {
    const id = process.env.CLAUDE_CODE_SESSION_ID?.trim();
    if (id) return { id, harness: "claude" };
  }

  if (harness !== "claude") {
    const id = process.env.CODEX_SESSION_ID?.trim();
    if (id) return { id, harness: "codex" };
  }

  return undefined;
}

/** Milliseconds of recency that make a transcript a live candidate.
 * `CONTEXT_AXI_LIVE_WINDOW_SECONDS=0` turns ambiguity detection off. */
function liveWindowMs(): number {
  const raw = process.env.CONTEXT_AXI_LIVE_WINDOW_SECONDS;
  if (raw === undefined) return DEFAULT_LIVE_WINDOW_SECONDS * 1_000;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_LIVE_WINDOW_SECONDS * 1_000;
  }
  return seconds * 1_000;
}

type LiveCandidate = { candidate: TranscriptCandidate; harness: Harness };

/** Refuse to guess when several sessions in this cwd are all active. Picking the
 * newest silently reports another session's usage to the caller. */
function ambiguityError(live: LiveCandidate[]): DiscoveryError {
  const listed = live
    .map((entry) => `  ${entry.harness}  ${entry.candidate.sessionId}`)
    .join("\n");
  return {
    code: "ambiguous_session",
    message:
      `${live.length} sessions are active in this directory, so the newest transcript ` +
      `is not necessarily yours:\n${listed}\n` +
      "Pass --session <id> or --transcript <path> to choose one. Inside a harness, " +
      "export CLAUDE_CODE_SESSION_ID or CODEX_SESSION_ID and it resolves itself. " +
      "Set CONTEXT_AXI_LIVE_WINDOW_SECONDS=0 to disable this check.",
  };
}

/** Locate the transcript to inspect, honoring --session / --transcript overrides,
 * falling back to the newest matching Claude or Codex transcript in auto mode. */
export function resolveTranscript(options: {
  cwd: string;
  session?: string | undefined;
  transcript?: string | undefined;
  harness?: HarnessOption | undefined;
}): DiscoveryResult {
  const harness = options.harness ?? "auto";

  if (options.transcript) {
    const resolvedHarness =
      harness === "auto"
        ? isCodexTranscriptPath(options.transcript)
          ? "codex"
          : "claude"
        : harness;
    const metadata =
      resolvedHarness === "codex" ? readCodexRolloutMetadata(options.transcript) : undefined;
    return {
      ok: true,
      transcript: options.transcript,
      sessionId: metadata?.sessionId ?? stem(options.transcript),
      harness: resolvedHarness,
    };
  }

  if (options.session) {
    return lookupResult(
      harness === "codex"
        ? findCodexCandidate(options.cwd, options.session)
        : findClaudeCandidate(options.cwd, options.session),
      harness === "codex" ? "codex" : "claude",
    );
  }

  // The caller told us who it is through the environment. Only trust it when the
  // transcript really exists, so an explicit --cwd for another project still falls
  // through to discovery instead of pointing at a file that is not there.
  const envSession = detectEnvSession(harness);
  if (envSession) {
    const lookup =
      envSession.harness === "codex"
        ? findCodexCandidate(options.cwd, envSession.id)
        : findClaudeCandidate(options.cwd, envSession.id);
    if (lookup.ok && existsSync(lookup.candidate.transcript)) {
      return success(lookup.candidate, envSession.harness);
    }
  }

  const window = liveWindowMs();
  if (window > 0) {
    const cutoff = Date.now() - window;
    const live: LiveCandidate[] = [];
    if (harness !== "codex") {
      for (const candidate of listLiveClaudeCandidates(options.cwd, cutoff)) {
        live.push({ candidate, harness: "claude" });
      }
    }
    if (harness !== "claude") {
      for (const candidate of listLiveCodexCandidates(options.cwd, cutoff)) {
        live.push({ candidate, harness: "codex" });
      }
    }
    if (live.length > 1) {
      return { ok: false, error: ambiguityError(live) };
    }
  }

  if (harness === "claude") {
    return lookupResult(findClaudeCandidate(options.cwd), "claude");
  }

  if (harness === "codex") {
    return lookupResult(findCodexCandidate(options.cwd), "codex");
  }

  const claude = findClaudeCandidate(options.cwd);
  const codex = findCodexCandidate(options.cwd);

  if (claude.ok && codex.ok) {
    return success(
      codex.candidate.mtimeMs > claude.candidate.mtimeMs ? codex.candidate : claude.candidate,
      codex.candidate.mtimeMs > claude.candidate.mtimeMs ? "codex" : "claude",
    );
  }

  if (codex.ok) return success(codex.candidate, "codex");
  if (claude.ok) return success(claude.candidate, "claude");

  // Auto mode preserves the existing Claude discovery error when neither
  // harness has a transcript for this cwd.
  return { ok: false, error: claude.error };
}

function findClaudeCandidate(cwd: string, session?: string): CandidateLookup {
  const dir = projectDir(cwd);

  if (session) {
    const transcript = join(dir, `${session}.jsonl`);
    return {
      ok: true,
      candidate: { transcript, sessionId: session, mtimeMs: Number.NEGATIVE_INFINITY },
    };
  }

  if (!existsSync(projectsRoot())) {
    return {
      ok: false,
      error: {
        code: "no_projects_dir",
        message: `No Claude projects directory found at ${projectsRoot()}`,
      },
    };
  }

  if (!existsSync(dir)) {
    return {
      ok: false,
      error: {
        code: "no_transcripts",
        message: `No transcripts found for cwd "${cwd}" (expected ${dir})`,
      },
    };
  }

  const jsonlFiles = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_transcripts",
        message: `No .jsonl transcripts found in ${dir}`,
      },
    };
  }

  let newest = jsonlFiles[0]!;
  let newestMtime = statSync(join(dir, newest)).mtimeMs;
  for (const f of jsonlFiles.slice(1)) {
    const mtime = statSync(join(dir, f)).mtimeMs;
    if (mtime > newestMtime) {
      newest = f;
      newestMtime = mtime;
    }
  }

  const transcript = join(dir, newest);
  return {
    ok: true,
    candidate: { transcript, sessionId: stem(newest), mtimeMs: newestMtime },
  };
}

function findCodexCandidate(cwd: string, session?: string): CandidateLookup {
  const root = codexSessionsRoot();

  if (!existsSync(root)) {
    return {
      ok: false,
      error: {
        code: "no_sessions_dir",
        message: `No Codex sessions directory found at ${root}`,
      },
    };
  }

  const rollouts = findCodexRollouts(root)
    .map((transcript) => ({ transcript, mtimeMs: statSync(transcript).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const rollout of rollouts) {
    const metadata = readCodexRolloutMetadata(rollout.transcript) ?? {};
    if (session) {
      if (metadata.sessionId !== session && stem(rollout.transcript) !== session) continue;
    } else if (metadata.cwd !== cwd) {
      continue;
    }

    return {
      ok: true,
      candidate: {
        transcript: rollout.transcript,
        sessionId: metadata.sessionId ?? stem(rollout.transcript),
        mtimeMs: rollout.mtimeMs,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "no_transcripts",
      message: session
        ? `No Codex rollout found for session "${session}" under ${root}`
        : `No Codex rollouts found for cwd "${cwd}" under ${root}`,
    },
  };
}

/** Claude transcripts in this cwd modified at or after `cutoffMs`. */
function listLiveClaudeCandidates(cwd: string, cutoffMs: number): TranscriptCandidate[] {
  const dir = projectDir(cwd);
  if (!existsSync(dir)) return [];

  const live: TranscriptCandidate[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    const transcript = join(dir, file);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(transcript).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs >= cutoffMs) {
      live.push({ transcript, sessionId: stem(file), mtimeMs });
    }
  }
  return live;
}

/** Codex rollouts recorded against this cwd and modified at or after `cutoffMs`.
 * Rollouts are walked newest first so the scan stops at the cutoff instead of
 * reading metadata for every rollout on disk. */
function listLiveCodexCandidates(cwd: string, cutoffMs: number): TranscriptCandidate[] {
  const root = codexSessionsRoot();
  if (!existsSync(root)) return [];

  const rollouts = findCodexRollouts(root)
    .map((transcript) => ({ transcript, mtimeMs: statSync(transcript).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const live: TranscriptCandidate[] = [];
  for (const rollout of rollouts) {
    if (rollout.mtimeMs < cutoffMs) break;
    const metadata = readCodexRolloutMetadata(rollout.transcript) ?? {};
    if (metadata.cwd !== cwd) continue;
    live.push({
      transcript: rollout.transcript,
      sessionId: metadata.sessionId ?? stem(rollout.transcript),
      mtimeMs: rollout.mtimeMs,
    });
  }
  return live;
}

function findCodexRollouts(dir: string): string[] {
  const rollouts: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      rollouts.push(...findCodexRollouts(path));
    } else if (entry.isFile() && isCodexRolloutFile(path)) {
      rollouts.push(path);
    }
  }
  return rollouts;
}

/** Read only through the first session_meta record while filtering rollouts.
 * The selected transcript receives the full scan in findLastCodexUsage. */
function readCodexRolloutMetadata(path: string): CodexDiscoveryMetadata | undefined {
  let descriptor: number | undefined;

  try {
    descriptor = openSync(path, "r");
    const buffer = Buffer.alloc(8_192);
    const decoder = new StringDecoder("utf8");
    let remainder = "";

    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;

      remainder += decoder.write(buffer.subarray(0, bytesRead));
      const lines = remainder.split("\n");
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        const metadata = sessionMetaFromLine(line);
        if (metadata) return metadata;
      }
    }

    return sessionMetaFromLine(remainder + decoder.end());
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sessionMetaFromLine(line: string): CodexDiscoveryMetadata | undefined {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (typeof record !== "object" || record === null) return undefined;
  const typedRecord = record as Record<string, unknown>;
  if (typedRecord.type !== "session_meta") return undefined;

  const payload = typedRecord.payload;
  if (typeof payload !== "object" || payload === null) return {};
  const typedPayload = payload as Record<string, unknown>;
  const sessionId =
    typeof typedPayload.session_id === "string"
      ? typedPayload.session_id
      : typeof typedPayload.id === "string"
        ? typedPayload.id
        : undefined;

  return {
    cwd: typeof typedPayload.cwd === "string" ? typedPayload.cwd : undefined,
    sessionId,
  };
}

function isCodexRolloutFile(path: string): boolean {
  const base = basename(path);
  return base.startsWith("rollout-") && base.endsWith(".jsonl");
}

function isCodexTranscriptPath(path: string): boolean {
  return isCodexRolloutFile(path) || path.startsWith(`${codexSessionsRoot()}${sep}`);
}

function lookupResult(lookup: CandidateLookup, harness: Harness): DiscoveryResult {
  return lookup.ok ? success(lookup.candidate, harness) : { ok: false, error: lookup.error };
}

function success(candidate: TranscriptCandidate, harness: Harness): DiscoveryResult {
  return {
    ok: true,
    transcript: candidate.transcript,
    sessionId: candidate.sessionId,
    harness,
  };
}
