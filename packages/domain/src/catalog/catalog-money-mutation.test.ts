import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import { prepareCatalogMoneySubmission } from "./catalog-money-submission";
import { readCatalogMoneyMap, applyCatalogMoneyRevision } from "../money/legacy-money-store";
import { moneyTransaction } from "../money/legacy-money-transaction";
import { createCatalogMoneyService } from "./catalog-money-service";
import {
  createCatalogProposalTransactionService,
  createCatalogProposalService,
} from "./proposal-service";
import { decodeMoneyFactToken } from "../money/legacy-money-tokens";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
let category: string, money: string;
const actor = randomUUID();
const text = { language: "en", title: "Synthetic priced reference" };
const raw = { amountMinor: 100, currency: "AFN" };
const authoring = {
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency: "AFN",
  decimal: "1",
};
const service = (context?: unknown) => createCatalogMaintenanceService(db, context);
const input = () => ({
  categoryTemplateId: category,
  text,
  attributes: [{ definitionId: money, value: raw }],
});
const read = (id: string, revision: number) =>
  db.$transaction((tx) =>
    readCatalogMoneyMap(moneyTransaction(tx), id, revision, { userId: actor }),
  );
async function context(
  patch: object,
  intents: object[],
  targetEntryId: string | null = null,
  baseRevision: number | null = null,
) {
  const envelope = await db.$transaction(
    (tx) =>
      prepareCatalogMoneySubmission(tx, actor, {
        proposal: {
          targetEntryId,
          baseRevision,
          patch,
          summary: "Checked synthetic monetary source",
        },
        money: { schemaVersion: 1, intents },
      }),
    { isolationLevel: "ReadCommitted" },
  );
  return { kind: "VALIDATED", actorId: actor, envelope };
}
const authored = () =>
  context({ kind: "CREATE_ENTRY", input: input() }, [
    { target: "ENTRY", definitionId: money, intent: { op: "NEW", authoring } },
  ]);
describe.runIf(enabled)("actual canonical catalog money mutation integration", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    await db.user.create({
      data: { id: actor, name: "Synthetic canonical moderator", email: `${actor}@example.invalid` },
    });
    await db.applicationRoleGrant.create({
      data: {
        userId: actor,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "Canonical money conformance",
      },
    });
    const t = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `canonical_${actor.replaceAll("-", "")}`,
      labels: { de: "Test", en: "Test" },
      definitions: [{ key: "price", type: "MONEY", labels: { de: "Preis", en: "Price" } }],
    });
    category = t.id;
    money = t.definitions[0]!.id;
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("authors exact money and carries it through a text-only revision without rewriting old snapshots", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const before = await db.catalogRevision.findUniqueOrThrow({
      where: { entryId_revision: { entryId: entry.state.id, revision: 1 } },
    });
    const first = (await read(entry.state.id, 1))[0]!;
    expect(first.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: "1.00",
    });
    const changed = await service({ kind: "LEGACY", actorId: actor }).updateCatalogEntry(
      entry.state.id,
      1,
      { text: { ...text, title: "Text correction only" } },
    );
    expect((await read(entry.state.id, changed.revision))[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      assertionId:
        first.interpretation.kind === "INTERPRETED" ? first.interpretation.assertionId : "missing",
    });
    expect(
      (
        await db.catalogRevision.findUniqueOrThrow({
          where: { entryId_revision: { entryId: entry.state.id, revision: 1 } },
        })
      ).snapshot,
    ).toEqual(before.snapshot);
  });
  it("invalidates an explicit legacy same-pair write even if the snapshot revision does not advance", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const first = (await read(entry.state.id, 1))[0]!;
    expect(first.interpretation.kind).toBe("INTERPRETED");
    const same = await service().updateCatalogEntry(entry.state.id, 1, {
      attributes: input().attributes,
    });
    expect(same.revision).toBe(1);
    const after = (await read(entry.state.id, 1))[0]!;
    expect(after.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
    expect(after.factToken).not.toBe(first.factToken);
  });
  it("applies a deliberate same-pair replacement and preserves its captured precondition", async () => {
    const entry = await service().createCatalogEntry(input());
    const first = (await read(entry.state.id, 1))[0]!;
    const patch = { kind: "UPDATE_ENTRY", input: { attributes: input().attributes } };
    const ctx = await context(
      patch,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "REPLACE", expectedFactToken: first.factToken, authoring },
        },
      ],
      entry.state.id,
      1,
    );
    const same = await service(ctx).updateCatalogEntry(entry.state.id, 1, patch.input);
    expect(same.revision).toBe(1);
    expect((await read(entry.state.id, 1))[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      decimal: "1.00",
    });
    await expect(
      service(ctx).updateCatalogEntry(entry.state.id, 1, patch.input),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("rejects mismatched frozen patch digests without creating a partial entry", async () => {
    const ctx = await authored();
    const before = await db.catalogEntry.count();
    await expect(
      service({
        ...ctx,
        envelope: { ...ctx.envelope, patchDigest: "a".repeat(64) },
      }).createCatalogEntry(input()),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    expect(await db.catalogEntry.count()).toBe(before);
  });
  it("authors and retains exact variant money independently of entry money", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const variantInput = {
      text,
      attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }],
    };
    const ctx = await context(
      { kind: "ADD_VARIANT", input: variantInput },
      [
        {
          target: "OPERATION_VARIANT",
          definitionId: money,
          intent: { op: "NEW", authoring: { ...authoring, decimal: "2" } },
        },
      ],
      entry.state.id,
      1,
    );
    const variant = await service(ctx).addCatalogVariant(entry.state.id, 1, variantInput);
    const values = await read(entry.state.id, variant.revision);
    expect(values.every((v) => v.interpretation.kind === "INTERPRETED")).toBe(true);
    const fact = values.find(
      (v) => v.subject.family === "CATALOG" && v.subject.target.kind === "VARIANT",
    )!;
    const changed = { ...variantInput, text: { ...text, title: "Variant wording only" } };
    const retained = await context(
      { kind: "UPDATE_VARIANT", variantId: variant.id, input: changed },
      [
        {
          target: "OPERATION_VARIANT",
          definitionId: money,
          intent: { op: "RETAIN", expectedFactToken: fact.factToken },
        },
      ],
      entry.state.id,
      variant.revision,
    );
    const updated = await service(retained).updateCatalogVariant(
      entry.state.id,
      variant.revision,
      variant.id,
      changed,
    );
    const beforeLegacy = await read(entry.state.id, updated.revision);
    expect(beforeLegacy.every((v) => v.interpretation.kind === "INTERPRETED")).toBe(true);
    const same = await service({ kind: "LEGACY", actorId: actor }).updateCatalogVariant(
      entry.state.id,
      updated.revision,
      variant.id,
      changed,
    );
    expect(same.revision).toBe(updated.revision);
    const afterLegacy = await read(entry.state.id, same.revision);
    expect(
      afterLegacy.find((v) => v.subject.family === "CATALOG" && v.subject.target.kind === "VARIANT")
        ?.interpretation.kind,
    ).toBe("UNKNOWN");
    expect(
      afterLegacy.find((v) => v.subject.family === "CATALOG" && v.subject.target.kind === "ENTRY"),
    ).toEqual(
      beforeLegacy.find((v) => v.subject.family === "CATALOG" && v.subject.target.kind === "ENTRY"),
    );
  });
  it("carries direct evidence through identifier add, correction and removal", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const first = (await read(entry.state.id, 1))[0]!.interpretation;
    if (first.kind !== "INTERPRETED") throw Error("Expected native authoring");
    const maintenance = service({ kind: "LEGACY", actorId: actor });
    const reference = await maintenance.addExternalIdentifier(entry.state.id, 1, {
      namespace: "museum",
      type: "accession",
      value: "one",
    });
    const updated = await maintenance.updateExternalIdentifier(
      entry.state.id,
      reference.revision,
      reference.id,
      { namespace: "museum", type: "accession", value: "two" },
    );
    const removed = await maintenance.removeExternalIdentifier(
      entry.state.id,
      updated.revision,
      reference.id,
    );
    for (const revision of [reference.revision, updated.revision, removed.revision])
      expect((await read(entry.state.id, revision))[0]!.interpretation).toMatchObject({
        kind: "INTERPRETED",
        assertionId: first.assertionId,
        decimal: "1.00",
      });
  });
  it("does not invent an operator for actorless maintenance of known interpretation", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    await expect(
      service().updateCatalogEntry(entry.state.id, 1, {
        text: { ...text, title: "Unattributed maintenance" },
      }),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    expect(
      (await db.catalogEntry.findUniqueOrThrow({ where: { id: entry.state.id } })).revision,
    ).toBe(1);
    expect(
      await db.catalogRevision.findUnique({
        where: { entryId_revision: { entryId: entry.state.id, revision: 2 } },
      }),
    ).toBeNull();
  });
  it("rolls back target meaning and saves selected evidence even when the complete raw snapshot is identical", async () => {
    const entry = await service().createCatalogEntry(input());
    const targetFact = (await read(entry.state.id, 1))[0]!;
    const selected = decodeMoneyFactToken(targetFact.factToken);
    const other = await service().updateCatalogEntry(entry.state.id, 1, {
      text: { ...text, title: "Temporary wording" },
    });
    const prior = (await read(entry.state.id, other.revision))[0]!;
    const patch = { kind: "UPDATE_ENTRY", input: { text, attributes: input().attributes } };
    const ctx = await context(
      patch,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "REPLACE", expectedFactToken: prior.factToken, authoring },
        },
      ],
      entry.state.id,
      other.revision,
    );
    const known = await service(ctx).updateCatalogEntry(
      entry.state.id,
      other.revision,
      patch.input,
    );
    expect((await read(entry.state.id, known.revision))[0]!.interpretation.kind).toBe(
      "INTERPRETED",
    );
    const before = await db.catalogRevision.findMany({
      where: { entryId: entry.state.id },
      orderBy: { revision: "asc" },
    });
    expect(before[0]!.snapshot).toEqual(before.at(-1)!.snapshot);
    const result = await createCatalogProposalService(db).rollbackCatalogEntry(
      entry.state.id,
      actor,
      {
        expectedRevision: known.revision,
        targetRevision: 1,
        reason: "Restore the selected historical financial meaning",
      },
    );
    expect(result.revision).toBe(known.revision);
    expect((await read(entry.state.id, result.revision))[0]!.interpretation.kind).toBe("UNKNOWN");
    expect(await db.catalogRevision.count({ where: { entryId: entry.state.id } })).toBe(
      before.length,
    );
    const audit = await db.catalogRollbackAudit.findFirstOrThrow({
      where: { entryId: entry.state.id },
    });
    expect(audit.moneyInterpretation).toMatchObject({
      schemaVersion: 1,
      sourceRevision: 1,
      paths: [
        {
          target: { kind: "ENTRY" },
          definitionId: money,
          sequence: selected.sequence,
          effectiveEventId: selected.effectiveEventId,
          originId: null,
        },
      ],
    });
    expect(Object.keys(result).sort()).toEqual(
      ["revision", "rollbackFromRevision", "state"].sort(),
    );
  });
  it("retains historical raw codes without current-list reinterpretation and permits explicit replacement", async () => {
    const id = randomUUID(),
      legacy = { amountMinor: 1, currency: "ZZZ" };
    const state = {
      schemaVersion: 1,
      id,
      categoryTemplateId: category,
      text: { ...text, translations: [] },
      sources: [],
      attributes: [{ definitionId: money, key: "price", type: "MONEY", value: legacy }],
      variants: [],
      identifiers: [],
    };
    await db.catalogEntry.create({
      data: { id, categoryTemplateId: category, authored: { text: state.text, sources: [] } },
    });
    await db.catalogAttributeValue.create({
      data: {
        entryId: id,
        categoryTemplateId: category,
        variantId: null,
        targetKey: "entry",
        definitionId: money,
        value: legacy,
      },
    });
    await db.catalogRevision.create({ data: { entryId: id, revision: 1, snapshot: state } });
    const before = (await read(id, 1))[0]!;
    const patch = {
      kind: "UPDATE_ENTRY",
      input: {
        text: { ...text, title: "Historical wording corrected" },
        attributes: [{ definitionId: money, value: legacy }],
      },
    };
    const retained = await context(
      patch,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "RETAIN", expectedFactToken: before.factToken },
        },
      ],
      id,
      1,
    );
    const updated = await service(retained).updateCatalogEntry(id, 1, patch.input);
    const after = (await read(id, updated.revision))[0]!;
    expect(after.raw).toEqual({ amountMinor: "1", currency: "ZZZ" });
    expect(after.interpretation.kind).toBe("UNKNOWN");
    const replacement = { kind: "UPDATE_ENTRY", input: { attributes: input().attributes } };
    const replaced = await context(
      replacement,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "REPLACE", expectedFactToken: after.factToken, authoring },
        },
      ],
      id,
      updated.revision,
    );
    const authoredRevision = await service(replaced).updateCatalogEntry(
      id,
      updated.revision,
      replacement.input,
    );
    expect((await read(id, authoredRevision.revision))[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: "1.00",
    });
    expect(
      (
        await db.catalogRevision.findUniqueOrThrow({
          where: { entryId_revision: { entryId: id, revision: 1 } },
        })
      ).snapshot,
    ).toEqual(state);
  });
  it("restores a historical unsupported raw code without borrowing the current authored unit", async () => {
    const id = randomUUID(),
      legacy = { amountMinor: 1, currency: "ZZZ" };
    const state = {
      schemaVersion: 1,
      id,
      categoryTemplateId: category,
      text: { ...text, translations: [] },
      sources: [],
      attributes: [{ definitionId: money, key: "price", type: "MONEY", value: legacy }],
      variants: [],
      identifiers: [],
    };
    await db.catalogEntry.create({
      data: { id, categoryTemplateId: category, authored: { text: state.text, sources: [] } },
    });
    await db.catalogAttributeValue.create({
      data: {
        entryId: id,
        categoryTemplateId: category,
        variantId: null,
        targetKey: "entry",
        definitionId: money,
        value: legacy,
      },
    });
    await db.catalogRevision.create({ data: { entryId: id, revision: 1, snapshot: state } });
    const before = (await read(id, 1))[0]!;
    const patch = { kind: "UPDATE_ENTRY", input: { attributes: input().attributes } };
    const ctx = await context(
      patch,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "REPLACE", expectedFactToken: before.factToken, authoring },
        },
      ],
      id,
      1,
    );
    const current = await service(ctx).updateCatalogEntry(id, 1, patch.input);
    const entry = { state: { id } };
    const restored = await createCatalogProposalService(db).rollbackCatalogEntry(id, actor, {
      expectedRevision: current.revision,
      targetRevision: 1,
      reason: "Restore captured historical amount",
    });
    expect((await read(entry.state.id, restored.revision))[0]).toMatchObject({
      raw: { amountMinor: "1", currency: "ZZZ" },
      interpretation: { kind: "UNKNOWN" },
    });
    expect(restored.state.attributes[0]!.value).toEqual(legacy);
  });
  it("reactivates the same retired variant UUID and restores its exact direct evidence", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const variantInput = { text, attributes: [{ definitionId: money, value: raw }] };
    const ctx = await context(
      { kind: "ADD_VARIANT", input: variantInput },
      [{ target: "OPERATION_VARIANT", definitionId: money, intent: { op: "NEW", authoring } }],
      entry.state.id,
      1,
    );
    const variant = await service(ctx).addCatalogVariant(entry.state.id, 1, variantInput);
    const original = (await read(entry.state.id, variant.revision)).find(
      (v) => v.subject.family === "CATALOG" && v.subject.target.kind === "VARIANT",
    )!;
    const rollbacks = createCatalogProposalService(db);
    const retired = await rollbacks.rollbackCatalogEntry(entry.state.id, actor, {
      expectedRevision: variant.revision,
      targetRevision: 1,
      reason: "Temporarily remove variant",
    });
    expect((await db.catalogVariant.findUniqueOrThrow({ where: { id: variant.id } })).active).toBe(
      false,
    );
    const restored = await rollbacks.rollbackCatalogEntry(entry.state.id, actor, {
      expectedRevision: retired.revision,
      targetRevision: variant.revision,
      reason: "Restore the exact variant",
    });
    expect(restored.state.variants[0]!.id).toBe(variant.id);
    expect((await db.catalogVariant.findUniqueOrThrow({ where: { id: variant.id } })).active).toBe(
      true,
    );
    expect(
      (await read(entry.state.id, restored.revision)).find(
        (v) => v.subject.family === "CATALOG" && v.subject.target.kind === "VARIANT",
      )!.interpretation,
    ).toMatchObject(
      original.interpretation.kind === "INTERPRETED"
        ? { ...original.interpretation, eventId: expect.any(String) }
        : original.interpretation,
    );
  });
  it("records revoked target evidence and never revives its copied interpretation", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    const review = createCatalogMoneyService(db, actor),
      path = { target: { kind: "ENTRY" }, definitionId: money };
    const history = await review.listHistory(entry.state.id, 1, path);
    const original = history.events[0]!;
    const changed = await service({ kind: "LEGACY", actorId: actor }).updateCatalogEntry(
      entry.state.id,
      1,
      { text: { ...text, title: "Later revision" } },
    );
    await review.revoke(entry.state.id, 1, {
      schemaVersion: 1,
      ...path,
      input: {
        assertionId: original.id,
        expectedAssertionToken: original.expectedAssertionToken,
        reason: "Original evidence withdrawn",
      },
    });
    const selected = decodeMoneyFactToken((await read(entry.state.id, 1))[0]!.factToken);
    const restored = await createCatalogProposalService(db).rollbackCatalogEntry(
      entry.state.id,
      actor,
      {
        expectedRevision: changed.revision,
        targetRevision: 1,
        reason: "Restore raw content without revoked meaning",
      },
    );
    expect((await read(entry.state.id, restored.revision))[0]!.interpretation.kind).toBe("UNKNOWN");
    expect(selected.revocationId).not.toBeNull();
    expect(
      (await db.catalogRollbackAudit.findFirstOrThrow({ where: { entryId: entry.state.id } }))
        .moneyInterpretation,
    ).toMatchObject({ paths: [{ revocationId: selected.revocationId }] });
  });
  it("rolls back equal-snapshot financial changes if the immutable rollback audit fails", async () => {
    const entry = await service(await authored()).createCatalogEntry(input());
    await service().updateCatalogEntry(entry.state.id, 1, { attributes: input().attributes });
    // Revision1 is now unknown. Author a new known revision, then restore byte-identical revision1.
    const title = { ...text, title: "Interim wording" };
    const changed = await service({ kind: "LEGACY", actorId: actor }).updateCatalogEntry(
      entry.state.id,
      1,
      { text: title },
    );
    const fact = (await read(entry.state.id, changed.revision))[0]!;
    const patch = { kind: "UPDATE_ENTRY", input: { text, attributes: input().attributes } };
    const ctx = await context(
      patch,
      [
        {
          target: "ENTRY",
          definitionId: money,
          intent: { op: "REPLACE", expectedFactToken: fact.factToken, authoring },
        },
      ],
      entry.state.id,
      changed.revision,
    );
    const known = await service(ctx).updateCatalogEntry(
      entry.state.id,
      changed.revision,
      patch.input,
    );
    const before = (await read(entry.state.id, known.revision))[0]!;
    await expect(
      db.$transaction(async (tx) => {
        // The audit is attempted after the actual sidecar mutation in this same physical transaction.
        const guarded = new Proxy(tx, {
          get(target, key) {
            if (key === "catalogRollbackAudit")
              return {
                ...target.catalogRollbackAudit,
                create: async () => {
                  throw new Error("Synthetic audit storage failure");
                },
              };
            return Reflect.get(target, key);
          },
        });
        return createCatalogProposalTransactionService(guarded).rollbackCatalogEntry(
          entry.state.id,
          actor,
          { expectedRevision: known.revision, targetRevision: 1, reason: "Atomic failure fixture" },
        );
      }),
    ).rejects.toThrow("Synthetic audit storage failure");
    expect((await read(entry.state.id, known.revision))[0]).toEqual(before);
    expect(await db.catalogRollbackAudit.count({ where: { entryId: entry.state.id } })).toBe(0);
    expect(await db.catalogRevision.count({ where: { entryId: entry.state.id } })).toBe(3);
  });
  it("carries all 10100 interpreted paths through the actual bounded canonical maintenance wrapper", async () => {
    const template = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `wide_${randomUUID().replaceAll("-", "")}`,
      labels: { de: "Breit", en: "Wide" },
      definitions: Array.from({ length: 100 }, (_, n) => ({
        key: `price_${n}`,
        type: "MONEY",
        labels: { de: "Preis", en: "Price" },
      })),
    });
    const id = randomUUID();
    const attrs = template.definitions.map((d) => ({
      definitionId: d.id,
      key: d.key,
      type: "MONEY",
      value: raw,
    }));
    const variants = Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      text: { ...text, translations: [] },
      sources: [],
      attributes: attrs,
    }));
    const state = {
      schemaVersion: 1,
      id,
      categoryTemplateId: template.id,
      text: { ...text, translations: [] },
      sources: [],
      attributes: attrs,
      variants,
      identifiers: [],
    };
    await db.catalogEntry.create({
      data: { id, categoryTemplateId: template.id, authored: { text: state.text, sources: [] } },
    });
    await db.catalogVariant.createMany({
      data: variants.map((v) => ({
        id: v.id,
        entryId: id,
        authored: { text: v.text, sources: [] },
      })),
    });
    const rawRows = [
      ...attrs.map((a) => ({
        entryId: id,
        categoryTemplateId: template.id,
        variantId: null,
        targetKey: "entry",
        definitionId: a.definitionId,
        value: raw,
      })),
      ...variants.flatMap((v) =>
        attrs.map((a) => ({
          entryId: id,
          categoryTemplateId: template.id,
          variantId: v.id,
          targetKey: v.id,
          definitionId: a.definitionId,
          value: raw,
        })),
      ),
    ];
    for (let offset = 0; offset < rawRows.length; offset += 500)
      await db.catalogAttributeValue.createMany({ data: rawRows.slice(offset, offset + 500) });
    await db.catalogRevision.create({ data: { entryId: id, revision: 1, snapshot: state } });
    const { parseLegacyMoneyAuthoring } = await import("../money/legacy-money-policy");
    const receipt = parseLegacyMoneyAuthoring(authoring);
    const actions = [
      ...attrs.map((a) => ({
        target: { kind: "ENTRY" },
        definitionId: a.definitionId,
        op: "AUTHOR",
        receipt,
      })),
      ...variants.flatMap((v) =>
        attrs.map((a) => ({
          target: { kind: "VARIANT", variantId: v.id },
          definitionId: a.definitionId,
          op: "AUTHOR",
          receipt,
        })),
      ),
    ];
    await db.$transaction(
      (tx) =>
        applyCatalogMoneyRevision(
          moneyTransaction(tx),
          { userId: actor },
          { entryId: id, sourceRevision: null, destinationRevision: 1, actions },
        ),
      { timeout: 40000 },
    );
    console.info(
      JSON.stringify({ check: "M4_CANONICAL_MAX_CARRY_SOURCE_READY", paths: actions.length }),
    );
    const start = performance.now();
    const changed = await service({ kind: "LEGACY", actorId: actor }).updateCatalogEntry(id, 1, {
      text: { ...text, title: "Full preserved monetary revision" },
    });
    const elapsedMs = Math.round(performance.now() - start);
    expect(changed.revision).toBe(2);
    const views = await db.$transaction(
      (tx) => readCatalogMoneyMap(moneyTransaction(tx), id, 2, { userId: actor }),
      { timeout: 10000 },
    );
    expect(views).toHaveLength(10100);
    expect(
      views.every(
        (v) => v.interpretation.kind === "INTERPRETED" && v.interpretation.decimal === "1.00",
      ),
    ).toBe(true);
    expect(
      await db.catalogMoneyInterpretationEvent.count({
        where: { entryId: id, revision: 2, operation: "COPY" },
      }),
    ).toBe(10100);
    expect(
      (
        await db.catalogRevision.findUniqueOrThrow({
          where: { entryId_revision: { entryId: id, revision: 1 } },
        })
      ).snapshot,
    ).toEqual(state);
    console.info(
      JSON.stringify({
        check: "M4_CANONICAL_MAX_CARRY",
        paths: views.length,
        elapsedMs,
        revision: changed.revision,
      }),
    );
  }, 100000);
});
