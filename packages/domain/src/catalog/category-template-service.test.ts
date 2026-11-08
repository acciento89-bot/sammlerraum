import { describe, expect, it } from "vitest";

import { validateAttributeValue } from "./category-template-service";

const labels = { de: "Wert", en: "Value" };
const definition = (type: string, options: { key: string; labels: typeof labels }[] = []) => ({
  key: "value",
  labels,
  type,
  options,
});

describe("catalog attribute validation", () => {
  it("rejects a catalog attribute value that does not match its definition", async () => {
    await expect(
      validateAttributeValue(definition("INTEGER"), "not-a-number"),
    ).rejects.toMatchObject({ code: "CATALOG_ATTRIBUTE_TYPE_MISMATCH" });
  });

  it("preserves primitive mismatch errors even for oversized values", async () => {
    for (const value of ["x".repeat(20_001), Array.from({ length: 101 }, () => 1)]) {
      await expect(validateAttributeValue(definition("INTEGER"), value)).rejects.toMatchObject({
        code: "CATALOG_ATTRIBUTE_TYPE_MISMATCH",
      });
    }
  });

  it.each([
    [Array.from({ length: 101 }, () => 1)],
    [[...Array.from({ length: 100 }, () => "mint"), 1]],
    [[" ".repeat(20_001) + "mint", 1]],
  ])("preserves multi-select member mismatch errors before input bounds", async (value) => {
    await expect(
      validateAttributeValue(definition("MULTI_SELECT", [{ key: "mint", labels }]), value),
    ).rejects.toMatchObject({ code: "CATALOG_ATTRIBUTE_TYPE_MISMATCH" });
  });

  it.each([
    ["SHORT_TEXT", "  Stamp  ", "Stamp"],
    ["LONG_TEXT", "  Line one\nLine two  ", "Line one\nLine two"],
    ["INTEGER", 12, 12],
    ["DECIMAL", "0012.3400", "12.34"],
    ["DATE", "2024-02-29", "2024-02-29"],
    ["BOOLEAN", false, false],
    ["SINGLE_SELECT", " MINT ", "mint"],
    ["MULTI_SELECT", ["used", "MINT", "used"], ["used", "mint"]],
    ["URL", "https://example.com", "https://example.com/"],
    ["MONEY", { amountMinor: 1250, currency: "EUR" }, { amountMinor: 1250, currency: "EUR" }],
  ])("canonicalizes %s using the existing primitive semantics", async (type, value, expected) => {
    const options = type.includes("SELECT")
      ? [
          { key: "mint", labels: { de: "Neuwertig", en: "Mint condition" } },
          { key: "used", labels: { de: "Gebraucht", en: "Used condition" } },
        ]
      : [];
    await expect(validateAttributeValue(definition(type, options), value)).resolves.toEqual(
      expected,
    );
  });

  it.each([
    ["INTEGER", Number.MAX_SAFE_INTEGER + 1],
    ["DECIMAL", "0.1234567890123456789"],
    ["DECIMAL", "1e3"],
    ["DATE", "2023-02-29"],
    ["URL", "javascript:alert(1)"],
    ["SHORT_TEXT", "has\u0000nul"],
    ["MONEY", { amountMinor: 2, currency: "eur" }],
    ["SINGLE_SELECT", "Neuwertig"],
    ["MULTI_SELECT", Array.from({ length: 101 }, () => "mint")],
    ["MULTI_SELECT", [" ".repeat(20_001) + "mint"]],
  ])("rejects invalid %s values with a stable catalog error", async (type, value) => {
    const options = type.includes("SELECT") ? [{ key: "mint", labels }] : [];
    await expect(validateAttributeValue(definition(type, options), value)).rejects.toMatchObject({
      code: "CATALOG_ATTRIBUTE_VALUE_INVALID",
    });
  });

  it.each([
    { ...definition("INTEGER"), key: "Translated Key" },
    { ...definition("INTEGER"), type: "UNKNOWN" },
    { ...definition("INTEGER"), labels: { en: "Value" } },
    { ...definition("INTEGER"), ownerId: "private" },
    definition("INTEGER", [{ key: "mint", labels }]),
    definition("SINGLE_SELECT"),
    definition("MULTI_SELECT", [
      { key: "mint", labels },
      { key: "mint", labels },
    ]),
  ])("rejects malformed definitions before validating values", async (field) => {
    await expect(validateAttributeValue(field, 1)).rejects.toMatchObject({
      code: "CATALOG_ATTRIBUTE_DEFINITION_INVALID",
    });
  });
});
