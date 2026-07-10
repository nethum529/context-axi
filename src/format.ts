import { encode } from "@toon-format/toon";
import type { ContextReport } from "./report.js";

const WINDOW_SOURCE_NOTE: Record<ContextReport["windowSource"], string> = {
  override: "window set via --window",
  model: "window inferred from model (1M-context variant)",
  default: "window assumed (not knowable from transcript); pass --window to override",
};

export function formatCompact(report: ContextReport): string {
  const body = encode({
    percentUsed: report.percentUsed,
    tokensUsed: report.tokensUsed,
    window: report.window,
    windowSource: report.windowSource,
    model: report.model ?? "unknown",
    sessionId: report.sessionId,
    transcript: report.transcript,
  });

  const note = WINDOW_SOURCE_NOTE[report.windowSource];
  const hint = "next: pass --json for the raw object, or --window <n> to correct the assumed window.";

  return `${body}\nnote: ${note}\n${hint}`;
}

export function formatJson(report: ContextReport): string {
  return JSON.stringify(report);
}
