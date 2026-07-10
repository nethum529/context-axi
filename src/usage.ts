import { readFileSync } from "node:fs";

export type UsageInfo = {
  tokensUsed: number;
  model: string | undefined;
};

type AssistantUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
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

export function readTranscript(path: string): string {
  return readFileSync(path, "utf8");
}
