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

  it("maps known 1M model families without a marker", () => {
    for (const model of [
      "claude-fable-5",
      "claude-mythos-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
    ]) {
      expect(resolveWindow({ model })).toEqual({
        window: ONE_M_WINDOW,
        source: "model",
      });
    }
  });

  it("maps 200k model families with source model", () => {
    expect(resolveWindow({ model: "claude-haiku-4-5-20251001" })).toEqual({
      window: DEFAULT_WINDOW,
      source: "model",
    });
  });

  it("falls back to default for unknown models", () => {
    expect(resolveWindow({ model: "claude-opus-4-5-20251101" })).toEqual({
      window: DEFAULT_WINDOW,
      source: "default",
    });
  });

  it("override always wins over model hint", () => {
    expect(resolveWindow({ override: 50000, model: "claude-sonnet-4-5[1m]" })).toEqual({
      window: 50000,
      source: "override",
    });
  });
});
