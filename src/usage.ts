import { readFileSync } from "node:fs";

export type UsageInfo = {
  tokensUsed: number;
  model: string | undefined;
};

export type CodexUsageInfo = UsageInfo & {
  sessionId?: string | undefined;
};

export type CodexTranscriptMetadata = {
  cwd?: string | undefined;
  model?: string | undefined;
  sessionId?: string | undefined;
};

type AssistantUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type CodexTokenUsage = {
  input_tokens?: number;
};

/** Scan transcript lines in reverse for the most recent assistant turn that
 * carries a usage object. Skips unparseable lines and turns without usage. */
export function findLastUsage(transcriptContent: string): UsageInfo | undefined {
  const lines = transcriptContent.split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (
      typeof obj !== "object" ||
      obj === null ||
      (obj as Record<string, unknown>).type !== "assistant"
    ) {
      continue;
    }

    // Subagent (sidechain) turns don't count toward the main session's context window.
    if ((obj as Record<string, unknown>).isSidechain === true) continue;

    const message = (obj as Record<string, unknown>).message;
    if (typeof message !== "object" || message === null) continue;

    const usage = (message as Record<string, unknown>).usage;
    if (typeof usage !== "object" || usage === null) continue;

    const u = usage as AssistantUsage;
    const model = (message as Record<string, unknown>).model;

    // output_tokens is deliberately excluded: we're measuring context-window
    // occupancy (what's been fed back in as input), not tokens generated.
    const tokensUsed =
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);

    return {
      tokensUsed,
      model: typeof model === "string" ? model : undefined,
    };
  }

  return undefined;
}

/** Read Codex metadata that appears in session_meta and turn_context records.
 * session_meta owns the initial cwd and session ID, while the latest
 * turn_context carries the active model. */
export function findCodexMetadata(transcriptContent: string): CodexTranscriptMetadata {
  let sessionId: string | undefined;
  let sessionCwd: string | undefined;
  let turnCwd: string | undefined;
  let model: string | undefined;

  for (const rawLine of transcriptContent.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const obj = parseRecord(line);
    if (!obj) continue;

    const payload = asRecord(obj.payload);
    if (!payload) continue;

    if (obj.type === "session_meta") {
      sessionId ??= stringValue(payload.session_id) ?? stringValue(payload.id);
      sessionCwd ??= stringValue(payload.cwd);
      continue;
    }

    if (obj.type === "turn_context") {
      turnCwd = stringValue(payload.cwd) ?? turnCwd;
      model = stringValue(payload.model) ?? model;
    }
  }

  return { cwd: sessionCwd ?? turnCwd, model, sessionId };
}

/** Find the last Codex token_count event. Codex reports cached input as a
 * subset of input_tokens, so input_tokens alone measures the context that was
 * sent on the most recent request. Generated output is excluded, matching the
 * Claude usage calculation above. */
export function findLastCodexUsage(transcriptContent: string): CodexUsageInfo | undefined {
  const metadata = findCodexMetadata(transcriptContent);
  let tokensUsed: number | undefined;

  for (const rawLine of transcriptContent.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const obj = parseRecord(line);
    if (!obj || obj.type !== "event_msg") continue;

    const payload = asRecord(obj.payload);
    if (!payload || payload.type !== "token_count") continue;

    const info = asRecord(payload.info);
    const usage = info ? asRecord(info.last_token_usage) : undefined;
    const inputTokens = usage ? numberValue((usage as CodexTokenUsage).input_tokens) : undefined;
    if (inputTokens !== undefined) tokensUsed = inputTokens;
  }

  if (tokensUsed === undefined) return undefined;

  return {
    tokensUsed,
    model: metadata.model,
    ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
  };
}

function parseRecord(line: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function readTranscript(path: string): string {
  return readFileSync(path, "utf8");
}
