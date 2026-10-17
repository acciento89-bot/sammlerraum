import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { createCatalogProposalService } from "@sammlerraum/domain/catalog/proposal-service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCatalogProposalRouteHandlers } from "./catalog-proposal-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `fixture_${randomUUID().replaceAll("-", "")}`;
const owner = `${prefix}_owner`,
  moderator = `${prefix}_mod`,
  foreign = `${prefix}_foreign`;
const text = { language: "pl", title: "Moneta" };
let categoryId: string;
function routes(actor: string | null) {
  return createCatalogProposalRouteHandlers({
    appOrigin: "https://example.test",
    getSession: async () =>
      actor ? { user: { id: actor, role: "ADMIN", email: "spoofed@example.invalid" } } : null,
    createService: () => createCatalogProposalService(db!),
  });
}
function mutation(body: unknown) {
  return new Request("https://example.test/api/v1/catalog/proposals", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
      "x-request-id": "catalog-integration-test",
    },
    body: JSON.stringify(body),
  });
}
async function body(response: Response) {
  return (await response.json()) as { proposal: { id: string }; proposals: unknown[] };
}
function read(query = "") {
  return new Request(`https://example.test/api/v1/catalog/proposals${query}`);
}

describe.runIf(enabled)("catalog proposal HTTP contracts with PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: [owner, moderator, foreign].map((id) => ({
        id,
        name: "Synthetic test",
        email: `${id}@example.invalid`,
      })),
    });
    await db!.applicationRoleGrant.create({
      data: {
        userId: moderator,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "Route integration",
      },
    });
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: prefix,
        labels: { de: "Münzen", en: "Coins" },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.catalogProposal.deleteMany({ where: { proposerId: { startsWith: prefix } } });
    await db.catalogRollbackAudit.deleteMany({ where: { actorId: { startsWith: prefix } } });
    const entry = { categoryTemplate: { key: prefix } };
    await db.catalogRevision.deleteMany({ where: { entry } });
    await db.catalogAttributeValue.deleteMany({ where: { entry } });
    await db.catalogExternalIdentifier.deleteMany({ where: { entry } });
    await db.catalogVariant.deleteMany({ where: { entry } });
    await db.catalogEntry.deleteMany({ where: entry });
    await db.categoryTemplateLabel.deleteMany({ where: { categoryTemplate: { key: prefix } } });
    await db.categoryTemplate.deleteMany({ where: { key: prefix } });
    await db.applicationRoleGrant.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });
  async function proposal() {
    const response = await routes(owner).POST_PROPOSAL(
      mutation({
        targetEntryId: null,
        baseRevision: null,
        summary: "New reference entry",
        patch: {
          kind: "CREATE_ENTRY",
          input: {
            categoryTemplateId: categoryId,
            text,
            sources: [{ note: "Authored source", license: "CC0" }],
          },
        },
      }),
    );
    expect(response.status).toBe(201);
    return (await body(response)).proposal;
  }
  it("submits, privately lists/details, reviews, approves and exposes only safe scalar proposal metadata", async () => {
    const row = await proposal();
    const own = await routes(owner).GET_PROPOSAL(read(), row.id.toUpperCase());
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("no-store");
    expect((await body(own)).proposal).toMatchObject({
      id: row.id,
      state: "PENDING",
      proposerId: owner,
    });
    expect((await routes(foreign).GET_PROPOSAL(read(), row.id)).status).toBe(404);
    expect((await routes(foreign).GET_PROPOSAL(read(), randomUUID())).status).toBe(404);
    expect((await body(await routes(foreign).GET_PROPOSALS(read()))).proposals).toEqual([]);
    for (const user of [owner, foreign]) {
      expect((await routes(user).GET_REVIEW_PROPOSALS(read())).status).toBe(403);
      expect((await routes(user).GET_REVIEW_PROPOSAL(read(), row.id)).status).toBe(403);
      expect(
        (
          await routes(user).POST_DECISION(
            mutation({ decision: "APPROVE", reason: "Spoofed cached session role" }),
            row.id,
          )
        ).status,
      ).toBe(403);
    }
    const review = await routes(moderator).GET_REVIEW_PROPOSAL(read(), row.id);
    expect(review.status).toBe(200);
    expect(await review.text()).not.toContain("@example.invalid");
    const approved = await routes(moderator).POST_DECISION(
      mutation({ decision: "APPROVE", reason: "Verified source" }),
      row.id,
    );
    expect(approved.status).toBe(200);
    expect((await body(approved)).proposal).toMatchObject({
      state: "APPROVED",
      resultRevision: 1,
      decisionReason: "Verified source",
    });
    expect(
      (
        await routes(moderator).POST_DECISION(
          mutation({ decision: "APPROVE", reason: "Replay" }),
          row.id,
        )
      ).status,
    ).toBe(409);
    expect((await routes(null).GET_PROPOSALS(read())).status).toBe(401);
  });
  it("returns HTTP409 after stale approval commits CONFLICT and leaves the catalog unchanged", async () => {
    const canonical = createCatalogMaintenanceService(db!);
    const entry = await canonical.createCatalogEntry({ categoryTemplateId: categoryId, text });
    const submitted = await routes(owner).POST_PROPOSAL(
      mutation({
        targetEntryId: entry.state.id,
        baseRevision: 1,
        summary: "Correction",
        patch: { kind: "UPDATE_ENTRY", input: { text: { ...text, title: "Proposed" } } },
      }),
    );
    const row = (await body(submitted)).proposal;
    await canonical.updateCatalogEntry(entry.state.id, 1, { text: { ...text, title: "Advanced" } });
    const response = await routes(moderator).POST_DECISION(
      mutation({ decision: "APPROVE", reason: "Review stale base" }),
      row.id,
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("x-request-id")).toBe("catalog-integration-test");
    expect(await response.json()).toMatchObject({
      error: { code: "CATALOG_PROPOSAL_CONFLICT", requestId: "catalog-integration-test" },
    });
    expect(await db!.catalogProposal.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      state: "CONFLICT",
      moderatorId: moderator,
    });
    expect(await canonical.getCatalogEntryAtRevision(entry.state.id, 2)).toMatchObject({
      state: { text: { title: "Advanced" } },
    });
    expect(await canonical.getCatalogEntryAtRevision(entry.state.id, 3)).toBeNull();
  });
  it("requires real authority and authored reason for rollback, and rejects foreign query scopes and cursors", async () => {
    const canonical = createCatalogMaintenanceService(db!);
    const entry = await canonical.createCatalogEntry({ categoryTemplateId: categoryId, text });
    await canonical.updateCatalogEntry(entry.state.id, 1, { text: { ...text, title: "Changed" } });
    const input = { expectedRevision: 2, targetRevision: 1, reason: "Restore original" };
    expect((await routes(owner).POST_ROLLBACK(mutation(input), entry.state.id)).status).toBe(403);
    expect(
      (await routes(moderator).POST_ROLLBACK(mutation({ ...input, reason: "" }), entry.state.id))
        .status,
    ).toBe(400);
    expect(
      (await routes(moderator).POST_ROLLBACK(mutation(input), entry.state.id.toUpperCase())).status,
    ).toBe(200);
    expect(
      await db!.catalogRollbackAudit.findFirst({ where: { entryId: entry.state.id } }),
    ).toMatchObject({ actorId: moderator, expectedRevision: 2, targetRevision: 1, revision: 3 });
    for (const query of ["?proposerId=foreign", "?cursor=bad", "?limit=51"])
      expect((await routes(owner).GET_PROPOSALS(read(query))).status).toBe(400);
  });
});
