import { describe, expect, it, vi } from "vitest";
import { decodeExactJson, numericLexeme, object, requireExactJsonRuntime } from "./exact-json";
import { ProviderFailure } from "./provider-failure";
describe("raw numeric provenance", () => {
  it("requires real reviver source support on the pinned runtime", () => {
    expect(() => requireExactJsonRuntime()).not.toThrow();
  });
  it("cannot forge numeric brands with provider JSON objects or strings", () => {
    for (const raw of ['{"lexeme":"123"}', '"123"', "{}"])
      expect(() => numericLexeme(decodeExactJson(raw), true)).toThrow("INVALID_RESPONSE");
    expect(numericLexeme(object(decodeExactJson('{"value":9007199254740993}')).value, false)).toBe(
      "9007199254740993",
    );
  });
  it("bounds ignored tree nodes as well as selected values", () => {
    expect(() =>
      decodeExactJson(JSON.stringify(Array.from({ length: 10001 }, () => null))),
    ).toThrow("INVALID_RESPONSE");
  });
  it("fails closed if a runtime silently omits reviver source context", async () => {
    const native = JSON.parse;
    vi.resetModules();
    const spy = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) =>
      native(
        text,
        reviver
          ? function (key, value) {
              return reviver.call(this, key, value);
            }
          : undefined,
      ),
    );
    try {
      const exact = await import("./exact-json");
      expect(() => exact.requireExactJsonRuntime()).toThrow("PROVIDER_CONFIGURATION");
    } finally {
      spy.mockRestore();
      vi.resetModules();
    }
  });
  it("validates failure codes at runtime and exposes no foreign fields", () => {
    const e = new ProviderFailure("private-secret" as never);
    expect(e.message).toBe("INVALID_RESPONSE");
    expect(e.stack).toBe("ProviderFailure: INVALID_RESPONSE");
    expect(e.cause).toBeUndefined();
    expect(Object.isFrozen(e)).toBe(true);
  });
});
