export type WindowSource = "override" | "model" | "default";

export const DEFAULT_WINDOW = 200_000;
export const ONE_M_WINDOW = 1_000_000;

/** Models known to run on a 1M window without a [1m]/-1m marker in the
 * transcript's model string. */
const ONE_M_MODELS = [/^claude-fable-5/i];

/** Determine the context window: --window always wins, then a 1M-context
 * model hint in the model string, then the default. */
export function resolveWindow(options: {
  override?: number | undefined;
  model?: string | undefined;
}): { window: number; source: WindowSource } {
  if (options.override !== undefined) {
    return { window: options.override, source: "override" };
  }

  if (
    options.model &&
    (/(\[1m\]|-1m)/i.test(options.model) ||
      ONE_M_MODELS.some((re) => re.test(options.model!)))
  ) {
    return { window: ONE_M_WINDOW, source: "model" };
  }

  return { window: DEFAULT_WINDOW, source: "default" };
}
