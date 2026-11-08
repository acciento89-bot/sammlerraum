import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import {
  createCatalogProposalService,
  createCatalogProposalTransactionService,
} from "./proposal-service";
import { prepareCatalogMoneySubmission } from "./catalog-money-submission";
import {
  readCatalogMoneyMap,
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
} from "../money/legacy-money-store";
import { moneyTransaction } from "../money/legacy-money-transaction";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
let category: string, money: string;
const moderator = randomUUID(),
  proposer = randomUUID();
const text = { language: "en", title: "Synthetic proposed reference" };
const raw = { amountMinor: 100, currency: "AFN" };
const authoring = {
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency: "AFN",
  decimal: "1",
};
const entryInput = () => ({
  categoryTemplateId: category,
  text,
  attributes: [{ definitionId: money, value: raw }],
});
const body = () => ({
  proposal: {
    targetEntryId: null,
    baseRevision: null,
    summary: "Checked synthetic monetary authoring",
    patch: { kind: "CREATE_ENTRY", input: entryInput() },
  },
  money: {
    schemaVersion: 1,
    intents: [{ target: "ENTRY", definitionId: money, intent: { op: "NEW", authoring } }],
  },
});
const service = () => createCatalogProposalService(db);
const map = (id: string, revision: number) =>
  db.$transaction((tx) =>
    readCatalogMoneyMap(moneyTransaction(tx), id, revision, { userId: moderator }),
  );
async function knownEntry() {
  const envelope = await db.$transaction(
    (tx) => prepareCatalogMoneySubmission(tx, proposer, body()),
    { isolationLevel: "ReadCommitted" },
  );
  return createCatalogMaintenanceService(db, {
    kind: "VALIDATED",
    actorId: moderator,
    envelope,
  }).createCatalogEntry(entryInput());
}
describe.runIf(enabled)("actual catalog monetary proposal lifecycle", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    await db.user.createMany({
      data: [moderator, proposer].map((id) => ({
        id,
        name: "Synthetic proposal actor",
        email: `${id}@example.invalid`,
      })),
    });
    await db.applicationRoleGrant.create({
      data: {
        userId: moderator,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "Proposal conformance only",
      },
    });
    const t = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `proposal_${moderator.replaceAll("-", "")}`,
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
  it("freezes server receipts at submission but authors nothing until a real moderator approves", async () => {
    const before = await db.catalogEntry.count();
    const pending = await service().submitMoneyProposal(proposer, body());
    expect(pending.state).toBe("PENDING");
    expect(await db.catalogEntry.count()).toBe(before);
    expect(pending.moneyInterpretation).toMatchObject({
      schemaVersion: 1,
      baseRevision: null,
      paths: [
        {
          kind: "AUTHORED",
          receipt: { raw: { amountMinor: "100", currency: "AFN" }, exponent: 2 },
        },
      ],
    });
    await expect(
      service().approveProposal(pending.id, proposer, "Cannot approve own suggestion"),
    ).rejects.toMatchObject({ code: "APPLICATION_ROLE_REQUIRED" });
    const approved = await service().approveProposal(
      pending.id,
      moderator,
      "Verified actual synthetic source",
    );
    expect(approved.state).toBe("APPROVED");
    expect(
      (await map(approved.resultEntryId!, approved.resultRevision!))[0]!.interpretation,
    ).toMatchObject({ kind: "INTERPRETED", decimal: "1.00" });
    const events = await db.$queryRaw<
      Array<{ actorId: string }>
    >`SELECT "actorId" FROM "CatalogMoneyInterpretationEvent" WHERE "entryId"=${approved.resultEntryId}::uuid AND operation='AUTHOR'`;
    expect(events).toEqual([{ actorId: moderator }]);
  });
  it("carries untouched known facts through an old null-envelope proposal", async () => {
    const entry = await knownEntry();
    const first = (await map(entry.state.id, 1))[0]!.interpretation;
    if (first.kind !== "INTERPRETED") throw Error("Expected actual source authoring");
    const pending = await service().submitProposal(proposer, {
      targetEntryId: entry.state.id,
      baseRevision: 1,
      patch: { kind: "UPDATE_ENTRY", input: { text: { ...text, title: "Old protocol wording" } } },
      summary: "Old pending proposal, no monetary intent",
    });
    expect(pending.moneyInterpretation).toBeNull();
    const approved = await service().approveProposal(pending.id, moderator, "Checked wording only");
    expect((await map(entry.state.id, approved.resultRevision!))[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      assertionId: first.assertionId,
    });
  });
  it("commits CONFLICT and rolls back raw revisions when a replacement's same-raw source meaning changed", async () => {
    const entry = await knownEntry();
    const first = (await map(entry.state.id, 1))[0]!;
    const pending = await service().submitMoneyProposal(proposer, {
      proposal: {
        targetEntryId: entry.state.id,
        baseRevision: 1,
        summary: "Proposed financial replacement and wording",
        patch: {
          kind: "UPDATE_ENTRY",
          input: {
            text: { ...text, title: "Must be rolled back" },
            attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }],
          },
        },
      },
      money: {
        schemaVersion: 1,
        intents: [
          {
            target: "ENTRY",
            definitionId: money,
            intent: {
              op: "REPLACE",
              expectedFactToken: first.factToken,
              authoring: { ...authoring, decimal: "2" },
            },
          },
        ],
      },
    });
    const s = {
      family: "CATALOG" as const,
      entryId: entry.state.id,
      revision: 1,
      target: { kind: "ENTRY" as const },
      definitionId: money,
    };
    await db.$transaction(async (tx) => {
      const m = moneyTransaction(tx),
        current = await readMoneyFact(m, s, { userId: moderator });
      return appendMoneyAssertion(
        m,
        await requireMoneyToken(m, s, { userId: moderator }, current.factToken),
        {
          kind: "CLASSIFY",
          input: {
            expectedFactToken: current.factToken,
            exponent: 0,
            unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
            evidence: {
              category: "OPERATOR_VERIFIED_RECORD",
              reason: "Newly verified historical scale",
              reference: "SYNTHETIC-RECORD",
            },
          },
        },
      );
    });
    await expect(
      service().approveProposal(pending.id, moderator, "Approve only the submitted source state"),
    ).rejects.toMatchObject({ code: "CATALOG_PROPOSAL_CONFLICT" });
    expect((await db.catalogProposal.findUniqueOrThrow({ where: { id: pending.id } })).state).toBe(
      "CONFLICT",
    );
    expect(
      (await db.catalogEntry.findUniqueOrThrow({ where: { id: entry.state.id } })).revision,
    ).toBe(1);
    expect(
      await db.catalogRevision.findUnique({
        where: { entryId_revision: { entryId: entry.state.id, revision: 2 } },
      }),
    ).toBeNull();
    expect((await map(entry.state.id, 1))[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 0,
      decimal: "100",
    });
  });
  it("never persists incomplete money paths or permits editing a submitted envelope", async () => {
    const before = await db.catalogProposal.count();
    await expect(
      service().submitMoneyProposal(proposer, {
        ...body(),
        money: { schemaVersion: 1, intents: [] },
      }),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    expect(await db.catalogProposal.count()).toBe(before);
    const pending = await service().submitMoneyProposal(proposer, body());
    await expect(
      db.catalogProposal.update({
        where: { id: pending.id },
        data: { moneyInterpretation: { schemaVersion: 99 } },
      }),
    ).rejects.toThrow(/immutable/iu);
  });
  it("keeps submitted raw money unknown for an old same-snapshot proposal", async () => {
    const entry = await knownEntry();
    const before = (await map(entry.state.id, 1))[0]!;
    const pending = await service().submitProposal(proposer, {
      targetEntryId: entry.state.id,
      baseRevision: 1,
      patch: { kind: "UPDATE_ENTRY", input: { attributes: entryInput().attributes } },
      summary: "Old raw-only monetary suggestion",
    });
    const approved = await service().approveProposal(
      pending.id,
      moderator,
      "Reviewed raw content without unit authoring",
    );
    expect(approved.resultRevision).toBe(1);
    const after = (await map(entry.state.id, 1))[0]!;
    expect(after.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
    expect(after.factToken).not.toBe(before.factToken);
  });
  it("uses one pending quota across legacy and explicit-money submissions", async () => {
    const user = randomUUID();
    await db.user.create({
      data: { id: user, name: "Synthetic quota proposer", email: `${user}@example.invalid` },
    });
    for (let i = 0; i < 19; i++) await service().submitProposal(user, body().proposal);
    await service().submitMoneyProposal(user, body());
    await expect(service().submitMoneyProposal(user, body())).rejects.toMatchObject({
      code: "CATALOG_PROPOSAL_LIMIT_EXCEEDED",
    });
    expect(await db.catalogProposal.count({ where: { proposerId: user, state: "PENDING" } })).toBe(
      20,
    );
  });
  it("recovers from a real native serialization signal inside the apply savepoint", async () => {
    const entry = await knownEntry();
    const first = (await map(entry.state.id, 1))[0]!;
    const pending = await service().submitMoneyProposal(proposer, {
      proposal: {
        targetEntryId: entry.state.id,
        baseRevision: 1,
        summary: "Native error rollback fixture",
        patch: {
          kind: "UPDATE_ENTRY",
          input: {
            text: { ...text, title: "Never committed" },
            attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }],
          },
        },
      },
      money: {
        schemaVersion: 1,
        intents: [
          {
            target: "ENTRY",
            definitionId: money,
            intent: {
              op: "REPLACE",
              expectedFactToken: first.factToken,
              authoring: { ...authoring, decimal: "2" },
            },
          },
        ],
      },
    });
    let raised = false;
    const outcome = await db.$transaction(
      (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "$queryRaw")
              return async (parts: TemplateStringsArray, ...values: unknown[]) => {
                if (
                  !raised &&
                  parts.join("").includes('INSERT INTO "CatalogMoneyInterpretationEvent"')
                ) {
                  raised = true;
                  await target.$queryRaw`DO $$ BEGIN RAISE EXCEPTION 'Synthetic native serialization signal' USING ERRCODE='40001'; END $$`;
                }
                return target.$queryRaw(parts, ...values);
              };
            return Reflect.get(target, property, receiver);
          },
        });
        return createCatalogProposalTransactionService(proxy).approveProposal(
          pending.id,
          moderator,
          "Native savepoint recovery only",
        );
      },
      { isolationLevel: "ReadCommitted", timeout: 10000 },
    );
    expect(raised).toBe(true);
    expect(outcome).toMatchObject({ conflict: true, proposal: { state: "CONFLICT" } });
    expect((await db.catalogProposal.findUniqueOrThrow({ where: { id: pending.id } })).state).toBe(
      "CONFLICT",
    );
    expect(
      (await db.catalogEntry.findUniqueOrThrow({ where: { id: entry.state.id } })).revision,
    ).toBe(1);
    expect(
      await db.catalogRevision.findUnique({
        where: { entryId_revision: { entryId: entry.state.id, revision: 2 } },
      }),
    ).toBeNull();
    expect((await map(entry.state.id, 1))[0]).toEqual(first);
  });
});
