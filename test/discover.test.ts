import { describe, expect, it } from "vitest";
import { encodeCwd } from "../src/discover.js";

describe("encodeCwd", () => {
  it("replaces slashes with dashes", () => {
    expect(encodeCwd("/home/example/firstmate")).toBe("-home-example-firstmate");
  });

  it("replaces dots with dashes", () => {
    expect(encodeCwd("/home/example/my.project")).toBe("-home-example-my-project");
  });

  it("replaces both slashes and dots together", () => {
    expect(encodeCwd("/home/example/context-axi/v1.0")).toBe(
      "-home-example-context-axi-v1-0",
    );
  });
});
