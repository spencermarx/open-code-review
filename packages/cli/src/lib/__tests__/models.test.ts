import { describe, it, expect } from "vitest";
import { listModelsForVendor } from "../models.js";

describe("listModelsForVendor", () => {
  it("returns a non-empty list for claude (native or bundled)", () => {
    const result = listModelsForVendor("claude");
    expect(result.vendor).toBe("claude");
    expect(["native", "bundled"]).toContain(result.source);
    expect(result.models.length).toBeGreaterThan(0);
    for (const model of result.models) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
    }
  });

  it("returns a non-empty list for opencode (native or bundled)", () => {
    const result = listModelsForVendor("opencode");
    expect(result.vendor).toBe("opencode");
    expect(["native", "bundled"]).toContain(result.source);
    expect(result.models.length).toBeGreaterThan(0);
    for (const model of result.models) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
    }
  });

  it("bundled opencode entries include a provider prefix in the id", () => {
    const result = listModelsForVendor("opencode");
    if (result.source === "bundled") {
      for (const model of result.models) {
        expect(model.id).toMatch(/.+\/.+/);
      }
    }
  });
});
