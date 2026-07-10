export type WindowSource = "override" | "model" | "default";

export const DEFAULT_WINDOW = 200_000;
export const ONE_M_WINDOW = 1_000_000;

/** Determine the context window: --window always wins, then a 1M-context
 * model hint in the model string, then the default. */
export function resolveWindow(options: {
  override?: number | undefined;
  model?: string | undefined;
}): { window: number; source: WindowSource } {
  if (options.override !== undefined) {
    return { window: options.override, source: "override" };
  }

  if (options.model && /(\[1m\]|-1m)/i.test(options.model)) {
    return { window: ONE_M_WINDOW, source: "model" };
  }

  return { window: DEFAULT_WINDOW, source: "default" };
}
