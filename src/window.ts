export type WindowSource = "override" | "model" | "default";

export const DEFAULT_WINDOW = 200_000;
export const ONE_M_WINDOW = 1_000_000;

/** Known context windows per model family, from Anthropic's model catalog.
 * First match wins; keep more specific patterns above broader ones.
 * The transcript never states the window, so this is the best-effort mapping;
 * --window overrides it for sessions running a non-default window. */
const MODEL_WINDOWS: { pattern: RegExp; window: number }[] = [
  { pattern: /^claude-fable-5/i, window: ONE_M_WINDOW },
  { pattern: /^claude-mythos-5/i, window: ONE_M_WINDOW },
  { pattern: /^claude-opus-4-[678]/i, window: ONE_M_WINDOW },
  { pattern: /^claude-sonnet-5/i, window: ONE_M_WINDOW },
  { pattern: /^claude-sonnet-4-6/i, window: ONE_M_WINDOW },
  { pattern: /^claude-haiku/i, window: DEFAULT_WINDOW },
];

/** Determine the context window: --window always wins, then an explicit
 * [1m]/-1m marker in the model string, then the model-family lookup,
 * then the default. */
export function resolveWindow(options: {
  override?: number | undefined;
  model?: string | undefined;
}): { window: number; source: WindowSource } {
  if (options.override !== undefined) {
    return { window: options.override, source: "override" };
  }

  if (options.model) {
    if (/(\[1m\]|-1m)/i.test(options.model)) {
      return { window: ONE_M_WINDOW, source: "model" };
    }
    const match = MODEL_WINDOWS.find((m) => m.pattern.test(options.model!));
    if (match) {
      return { window: match.window, source: "model" };
    }
  }

  return { window: DEFAULT_WINDOW, source: "default" };
}
