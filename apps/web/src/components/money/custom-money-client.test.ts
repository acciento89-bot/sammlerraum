import { describe, expect, it } from "vitest";
import { MoneyViewSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import { initialMoneyDraft } from "./legacy-money-draft";
import { readCustomMoney, bindCreatedCustomDraft } from "./custom-money-client";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = id(999),
  defs = Array.from({ length: 52 }, (_, i) => id(i + 1));
const missing = (field: string): MoneyView =>
  MoneyViewSchema.parse({
    schemaVersion: 1,
    subject: { family: "CUSTOM", itemId: item, fieldDefinitionId: field },
    raw: null,
    factToken: `missing_${field}`,
    interpretation: { kind: "MISSING" },
  });
const purchase = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: { family: "PURCHASE", itemId: item },
  raw: null,
  factToken: "missing_purchase",
  interpretation: { kind: "MISSING" },
});
describe("bounded custom money browser adapter", () => {
  it("loads every requested field through bounded groups without per-field requests or truncation", async () => {
    const batches: number[] = [];
    const result = await readCustomMoney(item, defs, async (url) => {
      const ids = new URL(url, "https://example.invalid").searchParams.get("fields")!.split(",");
      batches.push(ids.length);
      return Response.json({ schemaVersion: 1, purchase, custom: ids.map(missing) });
    });
    expect(batches).toEqual([50, 2]);
    expect(Object.keys(result).sort()).toEqual([...defs].sort());
  });
  it("rejects wrong scope, duplicate input/output and a later failed chunk instead of returning partial facts", async () => {
    let calls = 0;
    await expect(
      readCustomMoney(item, [defs[0]!, defs[0]!], async () => {
        calls++;
        return Response.json({});
      }),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
    expect(calls).toBe(0);
    await expect(
      readCustomMoney(item, [defs[0]!], async () =>
        Response.json({ schemaVersion: 1, purchase, custom: [missing(defs[1]!)] }),
      ),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
    await expect(
      readCustomMoney(item, [defs[0]!, defs[1]!], async () =>
        Response.json({
          schemaVersion: 1,
          purchase,
          custom: [missing(defs[0]!), missing(defs[0]!)],
        }),
      ),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
    let chunk = 0;
    await expect(
      readCustomMoney(item, defs, async (url) => {
        if (++chunk === 2) throw Error("synthetic later read failure");
        const ids = new URL(url, "https://example.invalid").searchParams.get("fields")!.split(",");
        return Response.json({ schemaVersion: 1, purchase, custom: ids.map(missing) });
      }),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
    expect(chunk).toBe(2);
  });
  it("binds a new item's draft only to genuine absence and never rebases an existing precondition", () => {
    const draft = { ...initialMoneyDraft(null), mode: "REPLACE" as const, decimal: "1" };
    const empty = missing(defs[0]!);
    expect(bindCreatedCustomDraft(draft, empty)).toMatchObject({
      expectedFactToken: empty.factToken,
      decimal: "1",
      outcome: "READY",
    });
    const frozen = { ...draft, expectedFactToken: "original_token" };
    expect(bindCreatedCustomDraft(frozen, empty)).toEqual(frozen);
    const rival = MoneyViewSchema.parse({
      ...empty,
      raw: { amountMinor: "100", currency: "AFN" },
      interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
    });
    expect(bindCreatedCustomDraft(draft, rival)).toMatchObject({
      expectedFactToken: null,
      outcome: "CONFLICT",
      decimal: "1",
    });
    expect(() => bindCreatedCustomDraft(draft, purchase)).toThrow();
  });
});
