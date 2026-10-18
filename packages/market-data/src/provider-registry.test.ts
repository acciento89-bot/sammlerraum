import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./provider-registry";
const registration = (id = "fixture") => ({
  provider: { id, fetch: async () => [] },
  identifierNamespace: "fixture",
  identifierType: "product",
});
describe("trusted provider registry", () => {
  it("defaults to no providers and rejects unknown and duplicate providers", () => {
    expect(() => new ProviderRegistry().get("fixture")).toThrow();
    expect(() => new ProviderRegistry([registration(), registration()])).toThrow();
    expect(() => new ProviderRegistry([registration("bad ID")])).toThrow();
  });
  it("retains an explicit provider and seals its mapping against caller mutation", () => {
    const source = registration();
    const registry = new ProviderRegistry([source]);
    source.identifierNamespace = "different";
    expect(registry.get("fixture").identifierNamespace).toBe("fixture");
    expect(registry.get("fixture").provider.id).toBe("fixture");
  });
  it("rejects control suffixes in every registration identity", () => {
    for (const id of ["fixture\n", "fixture\r", "fixture\u007f"])
      expect(() => new ProviderRegistry([registration(id)])).toThrow();
    expect(
      () => new ProviderRegistry([{ ...registration(), identifierNamespace: "fixture\n" }]),
    ).toThrow();
    expect(
      () => new ProviderRegistry([{ ...registration(), identifierType: "product\n" }]),
    ).toThrow();
  });
});
