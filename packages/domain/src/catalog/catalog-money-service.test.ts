import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import { createCatalogMoneyService } from "./catalog-money-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
let category: string, money: string;
const moderator = randomUUID(),
  owner = randomUUID();
const text = { language: "en", title: "Synthetic classify reference" };
const raw = { amountMinor: 100, currency: "AFN" };
const svc = (actor = moderator) => createCatalogMoneyService(db, actor);
const path = () => ({ target: { kind: "ENTRY" }, definitionId: money });
const evidence = {
  category: "OPERATOR_VERIFIED_RECORD",
  reason: "Private verified historical unit",
  reference: "PRIVATE-NATIVE-RECORD",
};
const create = () =>
  createCatalogMaintenanceService(db).createCatalogEntry({
    categoryTemplateId: category,
    text,
    attributes: [{ definitionId: money, value: raw }],
  });
describe.runIf(enabled)("native catalog monetary review service", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    await db.user.createMany({
      data: [moderator, owner].map((id) => ({
        id,
        name: "Synthetic money reviewer",
        email: `${id}@example.invalid`,
      })),
    });
    await db.applicationRoleGrant.create({
      data: {
        userId: moderator,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "Global unit review",
      },
    });
    await db.collection.create({
      data: { ownerId: owner, name: "Owned private collection grants no global authority" },
    });
    const t = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `review_${moderator.replaceAll("-", "")}`,
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
  async function classify(id: string, revision = 1, exponent = 0) {
    const before = (await svc().getRevision(id, revision)).money[0]!;
    return svc().classify(id, revision, {
      schemaVersion: 1,
      ...path(),
      input: {
        expectedFactToken: before.factToken,
        exponent,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence,
      },
    });
  }
  it("declares the evidenced scale without changing raw bytes and keeps evidence moderator-only", async () => {
    const entry = await create();
    const snapshot = await db.catalogRevision.findUniqueOrThrow({
      where: { entryId_revision: { entryId: entry.state.id, revision: 1 } },
    });
    const classified = await classify(entry.state.id);
    expect(classified.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 0,
      decimal: "100",
    });
    const publicView = await svc(owner).getRevision(entry.state.id, 1);
    expect(publicView.money[0]).toEqual(classified);
    expect(JSON.stringify(publicView)).not.toContain(evidence.reference);
    expect(JSON.stringify(publicView)).not.toContain(evidence.reason);
    expect(JSON.stringify(publicView)).not.toContain(moderator);
    const history = await svc().listHistory(entry.state.id, 1, path());
    expect(history.events[0]).toMatchObject({
      operation: "CLASSIFY",
      actorId: moderator,
      reason: evidence.reason,
      evidenceReference: evidence.reference,
      originSubject: classified.subject,
      revocationId: null,
    });
    expect(history.events[0]).not.toHaveProperty("generation");
    expect(
      (
        await db.catalogRevision.findUniqueOrThrow({
          where: { entryId_revision: { entryId: entry.state.id, revision: 1 } },
        })
      ).snapshot,
    ).toEqual(snapshot.snapshot);
  });
  it("rejects an ordinary owner before decoding private history cursors or fact tokens", async () => {
    const entry = await create();
    await expect(
      svc(owner).listHistory(entry.state.id, 1, path(), { cursor: "***" }),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    await expect(
      svc(owner).classify(entry.state.id, 1, {
        schemaVersion: 1,
        ...path(),
        input: {
          expectedFactToken: "a",
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence,
        },
      }),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    expect((await svc(owner).getRevision(entry.state.id, 1)).money[0]!.interpretation.kind).toBe(
      "UNKNOWN",
    );
  });
  it("pages exact-subject history with signed-bigint cursor bounds and revokes the original assertion", async () => {
    const entry = await create();
    const classified = await classify(entry.state.id);
    const first = await svc().listHistory(entry.state.id, 1, path(), { limit: 1 });
    expect(first.events).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const cursor = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString());
    cursor.sequence = "9223372036854775808";
    await expect(
      svc().listHistory(entry.state.id, 1, path(), {
        cursor: Buffer.from(JSON.stringify(cursor)).toString("base64url"),
      }),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    const revoked = await svc().revoke(entry.state.id, 1, {
      schemaVersion: 1,
      ...path(),
      input: {
        assertionId: first.events[0]!.id,
        expectedAssertionToken: first.events[0]!.expectedAssertionToken,
        reason: "Withdraw the recorded evidence",
      },
    });
    expect(revoked.raw).toEqual(classified.raw);
    expect(revoked.interpretation).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
    const events = await svc().listHistory(entry.state.id, 1, path());
    expect(events.events.find((e) => e.id === first.events[0]!.id)?.revocationId).not.toBeNull();
    const other = await create();
    await expect(
      svc().listHistory(other.state.id, 1, path(), { cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
  });
  it("provides exact original scope for copied history and propagates original revocation", async () => {
    const entry = await create();
    const classified = await classify(entry.state.id);
    const changed = await createCatalogMaintenanceService(db, {
      kind: "LEGACY",
      actorId: moderator,
    }).updateCatalogEntry(entry.state.id, 1, {
      text: { ...text, title: "Copied finance context" },
    });
    const copied = await svc().listHistory(entry.state.id, changed.revision, path());
    expect(copied.events[0]).toMatchObject({
      operation: "COPY",
      originSubject: classified.subject,
      expectedAssertionToken: null,
    });
    const original = await svc().listHistory(entry.state.id, 1, path());
    await svc().revoke(entry.state.id, 1, {
      schemaVersion: 1,
      ...path(),
      input: {
        assertionId: original.events[0]!.id,
        expectedAssertionToken: original.events[0]!.expectedAssertionToken,
        reason: "Original record withdrawn",
      },
    });
    expect(
      (await svc(owner).getRevision(entry.state.id, changed.revision)).money[0]!.interpretation,
    ).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
  });
});
