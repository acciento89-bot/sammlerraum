import { describe, expect, it } from "vitest";
import * as c from "./search-references";
import { parseItemFilterJson } from "./search";
import { multiLeafReferenceDraft } from "./search-references.fixture";
const ids = Array.from(
  { length: 51 },
  (_, n) => `00000000-0000-4000-a000-${String(n + 1).padStart(12, "0")}`,
);
describe("bounded search reference contracts", () => {
  it("keeps a valid 100-reference draft separate from 50-entry hydration", () => {
    const raw = JSON.stringify(multiLeafReferenceDraft);
    expect(new TextEncoder().encode(raw).length).toBeLessThan(16384);
    expect(parseItemFilterJson(raw)).toEqual(multiLeafReferenceDraft);
    for (const leaf of multiLeafReferenceDraft.root.children)
      expect(c.CollectionReferencesInputSchema.parse({ ids: leaf.test.values }).ids).toHaveLength(
        50,
      );
    expect(() =>
      c.parseReferenceInput(c.CollectionReferencesInputSchema, {
        ids: multiLeafReferenceDraft.root.children.flatMap((leaf) => leaf.test.values),
      }),
    ).toThrow("SEARCH_INVALID");
  });
  it("normalizes input and rejects uppercase aliases, malformed/empty/51 batches and unknown keys", () => {
    expect(c.CollectionReferencesInputSchema.parse({ ids: [ids[0]!.toUpperCase()] }).ids).toEqual([
      ids[0],
    ]);
    for (const input of [
      { ids: [] },
      { ids },
      { ids: [ids[0], ids[0]!.toUpperCase()] },
      { ids: ["bad"] },
      { ids: [ids[0]], owner: "secret" },
      null,
      [],
    ])
      expect(() => c.parseReferenceInput(c.CollectionReferencesInputSchema, input)).toThrow(
        "SEARCH_INVALID",
      );
  });
  it("enforces SUMMARY50 and OPTIONS2 without dropping identities", () => {
    const references = ids.slice(0, 50).map((id) => [ids[0], id]);
    expect(c.CustomReferencesInputSchema.parse({ references }).detail).toBe("SUMMARY");
    expect(
      c.CustomReferencesInputSchema.parse({ references: references.slice(0, 2), detail: "OPTIONS" })
        .references,
    ).toHaveLength(2);
    for (const input of [
      { references: references.slice(0, 3), detail: "OPTIONS" },
      { references: [references[0], references[0]] },
      {
        references: [
          [ids[0], ids[0]],
          [ids[0]!.toUpperCase(), ids[0]!.toUpperCase()],
        ],
      },
      { references: [[ids[0], null]] },
      { references: [references[0]], detail: "FULL" },
    ])
      expect(() => c.parseReferenceInput(c.CustomReferencesInputSchema, input)).toThrow(
        "SEARCH_INVALID",
      );
    expect(
      c.ConditionReferencesInputSchema.parse({ references: [[ids[0], null]] }).references,
    ).toEqual([[ids[0], null]]);
  });
  it("requires real persisted condition flags instead of producer defaults", () => {
    const option = {
      id: ids[0],
      schemeId: ids[1],
      categoryTemplateId: ids[2],
      labelKey: "condition.good",
      labels: { de: "Gut", en: "Good" },
      position: 0,
    };
    expect(c.ConditionReferenceOptionSchema.safeParse(option).success).toBe(false);
    expect(
      c.ConditionReferenceOptionSchema.safeParse({ ...option, active: false, normalizedBand: null })
        .success,
    ).toBe(true);
  });
  it("rejects dishonest available states and enforces option shape", () => {
    const definition = { id: ids[0], collectionId: ids[1], name: "Finish", type: "SINGLE_SELECT" };
    expect(c.CustomReferenceOptionsSchema.safeParse({ ...definition, options: [] }).success).toBe(
      false,
    );
    expect(
      c.CustomReferenceOptionsSchema.safeParse({ ...definition, type: "INTEGER", options: ["a"] })
        .success,
    ).toBe(false);
    expect(
      c.CustomReferenceOptionsSchema.safeParse({ ...definition, type: "INTEGER", options: [] })
        .success,
    ).toBe(true);
    expect(
      c.CustomReferenceOptionsSchema.safeParse({ ...definition, options: Array(101).fill("a") })
        .success,
    ).toBe(false);
  });
});
