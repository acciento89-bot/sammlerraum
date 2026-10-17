import { describe, it, expect } from "vitest";
import type { CatalogAttributeDefinition } from "@sammlerraum/contracts/catalog";
import { readText, readSources, readAttributes } from "./catalog-form-values";
const definition = (
  id: string,
  type: CatalogAttributeDefinition["type"],
): CatalogAttributeDefinition => ({
  id,
  categoryTemplateId: "category",
  key: id,
  type,
  position: 0,
  labels: { de: id, en: id },
  options: [],
});
describe("authored catalog form boundaries", () => {
  it("retains independently authored languages and source metadata", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      textLanguage: "en",
      title: "Original title",
      description: "Original description",
      translationCount: "1",
      "translationLanguage-0": "de",
      "translationTitle-0": "Deutscher Titel",
      "translationDescription-0": "Eigene Beschreibung",
      sourceCount: "1",
      "source-url-0": "https://example.test/reference",
      "source-note-0": "Authored note",
      "source-license-0": "Author supplied license",
    }))
      form.set(key, value);
    expect(readText(form)).toEqual({
      language: "en",
      title: "Original title",
      description: "Original description",
      translations: [
        { language: "de", title: "Deutscher Titel", description: "Eigene Beschreibung" },
      ],
    });
    expect(readSources(form)).toEqual([
      {
        url: "https://example.test/reference",
        note: "Authored note",
        license: "Author supplied license",
      },
    ]);
  });
  it("serializes exact typed choices, explicit false and money without copying private fields", () => {
    const fields = [
      definition("integer", "INTEGER"),
      definition("boolean", "BOOLEAN"),
      definition("multi", "MULTI_SELECT"),
      definition("money", "MONEY"),
      definition("unused", "SHORT_TEXT"),
    ];
    const form = new FormData();
    for (const id of ["integer", "boolean", "multi", "money"])
      form.set(`attribute-enabled-${id}`, "on");
    form.set("attribute-integer", "9007199254740991");
    form.append("attribute-multi", "first_key");
    form.append("attribute-multi", "second_key");
    form.set("attribute-money-amount", "12.34");
    form.set("attribute-money-currency", "EUR");
    form.set("privateNotes", "NEVER COPY");
    expect(readAttributes(form, fields)).toEqual([
      { definitionId: "integer", value: 9007199254740991 },
      { definitionId: "boolean", value: false },
      { definitionId: "multi", value: ["first_key", "second_key"] },
      { definitionId: "money", value: { amountMinor: 1234, currency: "EUR" } },
    ]);
  });
  it("rejects precision loss before submitting an attribute proposal", () => {
    const form = new FormData();
    form.set("attribute-enabled-integer", "on");
    form.set("attribute-integer", "9007199254740992");
    expect(() => readAttributes(form, [definition("integer", "INTEGER")])).toThrow();
    form.delete("attribute-enabled-integer");
    form.set("attribute-enabled-money", "on");
    form.set("attribute-money-amount", "1.001");
    form.set("attribute-money-currency", "EUR");
    expect(() => readAttributes(form, [definition("money", "MONEY")])).toThrow();
  });
});
