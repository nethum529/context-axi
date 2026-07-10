import { describe, expect, it } from "vitest";
import { resolveWindow, DEFAULT_WINDOW, ONE_M_WINDOW } from "../src/window.js";

describe("resolveWindow", () => {
  it("defaults to 200000 when no model or override", () => {
    expect(resolveWindow({})).toEqual({ window: DEFAULT_WINDOW, source: "default" });
  });

  it("uses 1M window for [1m] model tag", () => {
    expect(resolveWindow({ model: "claude-sonnet-4-5[1m]" })).toEqual({
      window: ONE_M_WINDOW,
      source: "model",
    });
  });

  it("uses 1M window for -1m model suffix", () => {
    expect(resolveWindow({ model: "claude-sonnet-4-5-1m" })).toEqual({
      window: ONE_M_WINDOW,
      source: "model",
    });
  });

  it("override always wins over model hint", () => {
    expect(resolveWindow({ override: 50000, model: "claude-sonnet-4-5[1m]" })).toEqual({
      window: 50000,
      source: "override",
    });
  });
});
