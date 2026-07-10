import type { WindowSource } from "./window.js";

export type ContextReport = {
  percentUsed: number;
  tokensUsed: number;
  window: number;
  windowSource: WindowSource;
  model: string | undefined;
  sessionId: string;
  transcript: string;
};

export function buildReport(input: {
  tokensUsed: number;
  window: number;
  windowSource: WindowSource;
  model: string | undefined;
  sessionId: string;
  transcript: string;
}): ContextReport {
  const percentUsed = Math.round((input.tokensUsed / input.window) * 100);
  return {
    percentUsed,
    tokensUsed: input.tokensUsed,
    window: input.window,
    windowSource: input.windowSource,
    model: input.model,
    sessionId: input.sessionId,
    transcript: input.transcript,
  };
}
