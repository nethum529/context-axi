import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findLastCodexUsage, findLastUsage } from "../src/usage.js";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("findLastUsage", () => {
  it("finds usage on the last assistant turn", () => {
    const content = [
      line({ type: "user", message: { content: "hi" } }),
      line({
        type: "assistant",
        message: {
          model: "claude-opus-4-8",
          usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 100 },
        },
      }),
    ].join("\n");

    const result = findLastUsage(content);
    expect(result).toEqual({ tokensUsed: 115, model: "claude-opus-4-8" });
  });

  it("walks back when the last assistant turn lacks usage", () => {
    const content = [
      line({
        type: "assistant",
        message: { model: "claude-opus-4-8", usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 } },
      }),
      line({ type: "assistant", message: { model: "claude-opus-4-8" } }),
      line({ type: "user", message: { content: "follow up" } }),
    ].join("\n");

    const result = findLastUsage(content);
    expect(result).toEqual({ tokensUsed: 6, model: "claude-opus-4-8" });
  });

  it("treats missing usage fields as 0", () => {
    const content = line({
      type: "assistant",
      message: { model: "claude-sonnet-5", usage: { cache_read_input_tokens: 42 } },
    });

    const result = findLastUsage(content);
    expect(result).toEqual({ tokensUsed: 42, model: "claude-sonnet-5" });
  });

  it("skips unparseable lines", () => {
    const content = [
      "not json {{{",
      line({
        type: "assistant",
        message: { model: "claude-opus-4-8", usage: { input_tokens: 7 } },
      }),
    ].join("\n");

    const result = findLastUsage(content);
    expect(result).toEqual({ tokensUsed: 7, model: "claude-opus-4-8" });
  });

  it("returns undefined when no assistant usage exists", () => {
    const content = [line({ type: "user", message: { content: "hi" } })].join("\n");
    expect(findLastUsage(content)).toBeUndefined();
  });

  it("skips sidechain (subagent) turns and finds the main session's usage", () => {
    const content = [
      line({
        type: "assistant",
        message: {
          model: "claude-opus-4-8",
          usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 },
        },
      }),
      line({
        type: "assistant",
        isSidechain: true,
        message: {
          model: "claude-haiku-4-5",
          usage: { input_tokens: 999, cache_creation_input_tokens: 999, cache_read_input_tokens: 999 },
        },
      }),
    ].join("\n");

    const result = findLastUsage(content);
    expect(result).toEqual({ tokensUsed: 6, model: "claude-opus-4-8" });
  });
});

describe("findLastCodexUsage", () => {
  it("uses the last token_count event from a rollout fixture", () => {
    const fixture = fileURLToPath(
      new URL(
        "./fixtures/rollout-2026-07-13T00-00-00-00000000-0000-0000-0000-000000000000.jsonl",
        import.meta.url,
      ),
    );

    expect(findLastCodexUsage(readFileSync(fixture, "utf8"))).toEqual({
      tokensUsed: 48000,
      model: "gpt-5.6-terra",
      sessionId: "codex-fixture-session",
    });
  });
});
