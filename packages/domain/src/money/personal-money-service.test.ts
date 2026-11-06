import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createPersonalMoneyService } from "./personal-money-service";
import { createItemService } from "../items/item-service";
import { createCustomFieldService } from "../custom-fields/custom-field-service";
import { readMoneyFact } from "./legacy-money-store";
import { runSearchTransaction } from "../search/search-read";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const users: string[] = [];
const authored = (decimal: string, currency = "AFN") => ({
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency,
  decimal,
});
async function fixture() {
  const actor = randomUUID();
  users.push(actor);
  await db!.user.create({
    data: { id: actor, name: "Money writer synthetic", email: `${actor}@example.invalid` },
  });
  const collection = await db!.collection.create({
    data: { ownerId: actor, name: "Writer collection" },
  });
  return { actor, collection: collection.id, service: createPersonalMoneyService(db!, actor) };
}
describe.runIf(enabled)("personal money authoring real transactions", () => {
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  });
  it("authors AFN decimal units explicitly and never infers them from an old raw write", async () => {
    const f = await fixture();
    const created = await f.service.createItemV2({
      schemaVersion: 1,
      item: { collectionId: f.collection, title: "Authored AFN" },
      purchase: { op: "NEW", authoring: authored("1") },
    });
    expect(created).toMatchObject({
      schemaVersion: 1,
      item: { purchaseAmountMinor: 100, purchaseCurrency: "AFN" },
      purchase: {
        raw: { amountMinor: "100", currency: "AFN" },
        interpretation: { kind: "INTERPRETED", exponent: 2, decimal: "1.00" },
      },
    });
    const legacy = await createItemService(db!, f.actor).createItem({
      collectionId: f.collection,
      title: "Old raw",
      purchaseAmountMinor: 1,
      purchaseCurrency: "AFN",
    });
    expect(
      (
        await runSearchTransaction(db!, (tx) =>
          readMoneyFact(tx, { family: "PURCHASE", itemId: legacy.id }, { userId: f.actor }),
        )
      ).interpretation,
    ).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
  });
  it("preserves nonmoney updates but invalidates equal-value explicit replacement tokens", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Original" },
        purchase: { op: "NEW", authoring: authored("1") },
      });
    const renamed = await f.service.updateItemV2(created.item.id, {
      schemaVersion: 1,
      item: { title: "Renamed" },
    });
    expect(renamed.purchase.factToken).toBe(created.purchase.factToken);
    const replaced = await f.service.updateItemV2(created.item.id, {
      schemaVersion: 1,
      purchase: {
        op: "REPLACE",
        expectedFactToken: created.purchase.factToken,
        authoring: authored("1"),
      },
    });
    expect(replaced.purchase.factToken).not.toBe(created.purchase.factToken);
    await expect(
      f.service.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: { op: "RETAIN", expectedFactToken: created.purchase.factToken },
      }),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("splits known per-unit purchase meaning without changing the exact total", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Ten units", quantity: 10 },
        purchase: { op: "NEW", authoring: authored("4", "EUR") },
      });
    const split = await createItemService(db!, f.actor).splitQuantityItem(created.item.id, 3);
    const source = await f.service.getMoney({ family: "PURCHASE", itemId: split.source.id }),
      child = await f.service.getMoney({ family: "PURCHASE", itemId: split.created.id });
    expect([split.source.quantity, split.created.quantity]).toEqual([7, 3]);
    expect(child.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: "4.00",
    });
    expect(source.interpretation).toMatchObject({ kind: "INTERPRETED", exponent: 2 });
    expect(
      BigInt(source.raw!.amountMinor) * BigInt(split.source.quantity) +
        BigInt(child.raw!.amountMinor) * BigInt(split.created.quantity),
    ).toBe(4000n);
  });
  it("rolls back split quantity and child when a provenance copy insert fails", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Atomic split", quantity: 10 },
        purchase: { op: "NEW", authoring: authored("4", "EUR") },
      });
    const name = `synthetic_money_copy_${randomUUID().replaceAll("-", "")}`;
    await db!.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic copy failure' USING ERRCODE='23514'; END $$`,
    );
    await db!.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE INSERT ON "PurchaseMoneyInterpretationEvent" FOR EACH ROW WHEN (NEW.operation='COPY' AND NEW."originEventId"='${created.purchase.interpretation.kind === "INTERPRETED" ? created.purchase.interpretation.assertionId : ""}'::uuid) EXECUTE FUNCTION "${name}"()`,
    );
    try {
      await expect(
        createItemService(db!, f.actor).splitQuantityItem(created.item.id, 3),
      ).rejects.toThrow();
      expect(
        (await db!.collectibleItem.findUniqueOrThrow({ where: { id: created.item.id } })).quantity,
      ).toBe(10);
      expect(await db!.collectibleItem.count({ where: { collectionId: f.collection } })).toBe(1);
    } finally {
      await db!.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "PurchaseMoneyInterpretationEvent"`);
      await db!.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });
  it("clear and readd cannot revive a previous fact token or meaning", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Clear lifecycle" },
        purchase: { op: "NEW", authoring: authored("1") },
      });
    const cleared = await f.service.updateItemV2(created.item.id, {
      schemaVersion: 1,
      purchase: { op: "CLEAR", expectedFactToken: created.purchase.factToken },
    });
    expect(cleared.purchase.interpretation).toEqual({ kind: "MISSING" });
    const replacement = await f.service.updateItemV2(created.item.id, {
      schemaVersion: 1,
      purchase: {
        op: "REPLACE",
        expectedFactToken: cleared.purchase.factToken,
        authoring: authored("1"),
      },
    });
    expect(replacement.purchase.factToken).not.toBe(created.purchase.factToken);
    await expect(
      f.service.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: { op: "RETAIN", expectedFactToken: cleared.purchase.factToken },
      }),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("authors custom money and copies its original assertion once per field during split", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Custom split", quantity: 5 },
      });
    const definition = await createCustomFieldService(db!, f.actor).createFieldDefinition({
      collectionId: f.collection,
      name: "Cost",
      type: "MONEY",
    });
    const subject = {
      family: "CUSTOM" as const,
      itemId: created.item.id,
      fieldDefinitionId: definition.id,
    };
    const missing = await f.service.getMoney(subject);
    const set = await f.service.setCustomMoneyV2(created.item.id, definition.id, {
      schemaVersion: 1,
      intent: {
        op: "REPLACE",
        expectedFactToken: missing.factToken,
        authoring: authored("1.25", "EUR"),
      },
    });
    expect(set.interpretation).toMatchObject({ kind: "INTERPRETED", decimal: "1.25" });
    const split = await createItemService(db!, f.actor).splitQuantityItem(created.item.id, 2);
    const child = await f.service.getMoney({ ...subject, itemId: split.created.id });
    expect(child.interpretation).toMatchObject({
      kind: "INTERPRETED",
      decimal: "1.25",
      assertionId: set.interpretation.kind === "INTERPRETED" ? set.interpretation.assertionId : "",
    });
    const [counts] = await db!.$queryRaw<
      Array<{ count: string }>
    >`SELECT count(*)::text AS count FROM "CustomMoneyInterpretationEvent" WHERE "itemId"=${split.created.id}::uuid AND "fieldDefinitionId"=${definition.id}::uuid AND operation='COPY'`;
    expect(counts!.count).toBe("1");
  });
  it("hides foreign facts and rejects legacy raw fields in the explicit authoring envelope", async () => {
    const f = await fixture(),
      foreign = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Private" },
      });
    await expect(
      foreign.service.getMoney({ family: "PURCHASE", itemId: created.item.id }),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
    await expect(
      foreign.service.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: { op: "RETAIN", expectedFactToken: created.purchase.factToken },
      }),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
    await expect(
      f.service.createItemV2({
        schemaVersion: 1,
        item: {
          collectionId: f.collection,
          title: "Wrong protocol",
          purchaseAmountMinor: 1,
          purchaseCurrency: "EUR",
        },
      }),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
  });
  it("pages private assertion history and supplies a fresh historical revocation precondition", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "History" },
        purchase: { op: "NEW", authoring: authored("1") },
      });
    const subject = { family: "PURCHASE" as const, itemId: created.item.id };
    let view = created.purchase;
    for (let n = 0; n < 22; n++)
      view = await f.service.classifyMoney(subject, {
        expectedFactToken: view.factToken,
        exponent: 2,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence: { category: "OWNER_ATTESTATION", reason: `Private reason ${n}` },
      });
    const first = (await f.service.listHistory(subject, { limit: 20 })) as {
      events: Array<{ id: string; expectedAssertionToken: string | null }>;
      nextCursor: string | null;
    };
    expect(first.events).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = (await f.service.listHistory(subject, {
      limit: 20,
      cursor: first.nextCursor,
    })) as typeof first;
    expect(second.events).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(24);
    const older = second.events.find((e) => e.expectedAssertionToken !== null)!;
    await f.service.revokeAssertion(subject, {
      assertionId: older.id,
      expectedAssertionToken: older.expectedAssertionToken,
      reason: "Historical correction",
    });
    const foreign = await fixture();
    await expect(foreign.service.listHistory(subject, {})).rejects.toMatchObject({
      code: "MONEY_NOT_FOUND",
    });
  });
  it("the legacy custom writer checks both actual item owner and collection owner", async () => {
    const owner = await fixture(),
      other = await fixture();
    const definition = await createCustomFieldService(db!, owner.actor).createFieldDefinition({
      collectionId: owner.collection,
      name: "Owned money",
      type: "MONEY",
    });
    await expect(
      db!.collectibleItem.create({
        data: {
          ownerId: other.actor,
          collectionId: owner.collection,
          title: "Inconsistent synthetic owner",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    const item = await db!.collectibleItem.create({
      data: { ownerId: other.actor, collectionId: other.collection, title: "Actual foreign owner" },
    });
    await expect(
      createCustomFieldService(db!, owner.actor).setFieldValue(item.id, definition.id, {
        amountMinor: 1,
        currency: "EUR",
      }),
    ).rejects.toMatchObject({ code: "CUSTOM_FIELD_NOT_FOUND" });
  });
  it("serializes competing classify/replace and clear/replace with one exact token winner", async () => {
    for (const competitor of ["CLASSIFY", "CLEAR"] as const) {
      const f = await fixture(),
        created = await f.service.createItemV2({
          schemaVersion: 1,
          item: { collectionId: f.collection, title: "Competing intents" },
          purchase: { op: "NEW", authoring: authored("1") },
        });
      const subject = { family: "PURCHASE" as const, itemId: created.item.id },
        token = created.purchase.factToken;
      const a = f.service.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: { op: "REPLACE", expectedFactToken: token, authoring: authored("2") },
      });
      const b =
        competitor === "CLEAR"
          ? f.service.updateItemV2(created.item.id, {
              schemaVersion: 1,
              purchase: { op: "CLEAR", expectedFactToken: token },
            })
          : f.service.classifyMoney(subject, {
              expectedFactToken: token,
              exponent: 0,
              unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
              evidence: { category: "OWNER_ATTESTATION", reason: "Actual observed units" },
            });
      const results = await Promise.allSettled([a, b]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "MONEY_CONFLICT" },
      });
      const current = await f.service.getMoney(subject);
      if (current.interpretation.kind === "INTERPRETED")
        expect(current.interpretation.decimal).toBe(
          current.raw!.amountMinor === "200" ? "2.00" : "100",
        );
      else expect(current.interpretation).toEqual({ kind: "MISSING" });
    }
  });
  it("concurrent split and replacement never pair copied raw with a different receipt", async () => {
    const f = await fixture(),
      created = await f.service.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Concurrent split", quantity: 10 },
        purchase: { op: "NEW", authoring: authored("4", "EUR") },
      });
    const [split] = await Promise.all([
      createItemService(db!, f.actor).splitQuantityItem(created.item.id, 3),
      f.service.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: {
          op: "REPLACE",
          expectedFactToken: created.purchase.factToken,
          authoring: authored("5", "EUR"),
        },
      }),
    ]);
    const child = await f.service.getMoney({ family: "PURCHASE", itemId: split.created.id });
    expect(["400", "500"]).toContain(child.raw!.amountMinor);
    expect(child.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: child.raw!.amountMinor === "400" ? "4.00" : "5.00",
    });
    expect(
      (await db!.collectibleItem.findUniqueOrThrow({ where: { id: created.item.id } })).quantity +
        split.created.quantity,
    ).toBe(10);
  });
  it("an authoring insert failure rolls back both a new raw item and its native generation", async () => {
    const f = await fixture(),
      name = `synthetic_money_author_${randomUUID().replaceAll("-", "")}`;
    await db!.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic author failure' USING ERRCODE='23514'; END $$`,
    );
    await db!.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE INSERT ON "PurchaseMoneyInterpretationEvent" FOR EACH ROW WHEN (NEW.operation='AUTHOR' AND NEW."actorId"='${f.actor}') EXECUTE FUNCTION "${name}"()`,
    );
    try {
      await expect(
        f.service.createItemV2({
          schemaVersion: 1,
          item: { collectionId: f.collection, title: "Must roll back" },
          purchase: { op: "NEW", authoring: authored("1") },
        }),
      ).rejects.toThrow();
      expect(await db!.collectibleItem.count({ where: { collectionId: f.collection } })).toBe(0);
    } finally {
      await db!.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "PurchaseMoneyInterpretationEvent"`);
      await db!.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });
});
