import { createValuationService } from "../valuations/valuation-service";
import { createMembershipService } from "../collaboration/membership-service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "../sharing/share-service";
import { createScopedSavedSearchService } from "./scoped-saved-search-service";
import { createScopedDashboardService } from "../dashboard/scoped-dashboard-service";
import { createSmartCollectionService } from "./smart-collection-service";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "live scoped saved definitions and dashboard parity",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture(values = false) {
      const owner = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, viewer])
        await db.user.create({
          data: {
            id,
            name: "Scoped consumers",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Private selected" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection.id, title: "Blue ceramic", quantity: 4 },
      });
      const shares = createShareService(db);
      const share = await shares.createShare(
        { userId: owner },
        {
          target: { kind: "COLLECTION", id: collection.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { values },
        },
      );
      const access = { token: share.token! };
      const definition = {
        version: 2,
        scope: { kind: "SHARE", shareId: share.share.id },
        text: "ceramic",
        filter: null,
        lifecycle: "ALL",
      };
      return {
        owner,
        viewer,
        collection,
        item,
        shares,
        share,
        access,
        definition,
        actor: { userId: viewer },
        saved: createScopedSavedSearchService(db),
        dashboard: createScopedDashboardService(db),
      };
    }
    it("stores only a symbolic v2 reference and resolves current rows without retaining credentials", async () => {
      const f = await fixture();
      const saved = await f.saved.create(
        f.actor,
        { name: "Shared ceramics", definition: f.definition },
        f.access,
      );
      expect(saved.definition).toEqual(f.definition);
      const row = await db.smartCollection.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.filterVersion).toBe(1);
      expect(JSON.stringify(row.definition)).not.toMatch(/token|pin|accessToken/i);
      expect(JSON.stringify(row.definition)).not.toContain(f.share.token!);
      expect((await f.saved.resolve(f.actor, saved.id, {}, f.access)).total).toBe(1);
      await db.collectibleItem.update({ where: { id: f.item.id }, data: { title: "Red glass" } });
      expect((await f.saved.resolve(f.actor, saved.id, {}, f.access)).total).toBe(0);
      await expect(f.saved.resolve(f.actor, saved.id, {})).rejects.toMatchObject({
        code: "SMART_COLLECTION_UNRESOLVABLE",
      });
      expect((await f.saved.get(f.actor, saved.id)).definition).toEqual(f.definition);
    });
    it("never falls back to owned inventory after revocation or the wrong valid token", async () => {
      const f = await fixture(),
        other = await fixture();
      const saved = await f.saved.create(
        f.actor,
        { name: "Selected only", definition: f.definition },
        f.access,
      );
      await expect(f.saved.resolve(f.actor, saved.id, {}, other.access)).rejects.toMatchObject({
        code: "SMART_COLLECTION_UNRESOLVABLE",
      });
      await f.shares.revokeShare(
        { userId: f.owner },
        { shareId: f.share.share.id, expectedRevision: 0 },
      );
      await expect(f.saved.resolve(f.actor, saved.id, {}, f.access)).rejects.toMatchObject({
        code: "SMART_COLLECTION_UNRESOLVABLE",
      });
      await expect(f.saved.get({ userId: other.viewer }, saved.id)).rejects.toMatchObject({
        code: "SMART_COLLECTION_NOT_FOUND",
      });
    });
    it("rejects credentials embedded in a persisted definition and keeps original v1 behavior", async () => {
      const f = await fixture();
      await expect(
        f.saved.create(
          f.actor,
          { name: "Unsafe", definition: { ...f.definition, token: f.share.token } },
          f.access,
        ),
      ).rejects.toMatchObject({ code: "SMART_COLLECTION_INVALID" });
      const own = await createSmartCollectionService(db).createSmartCollection(
        { userId: f.owner },
        {
          name: "Original own",
          definition: { version: 1, text: "", filter: null, lifecycle: "ACTIVE" },
        },
      );
      expect(own.definition.version).toBe(1);
      expect(
        (
          await createSmartCollectionService(db).resolveSmartCollectionItems(
            { userId: f.owner },
            own.id,
          )
        ).total,
      ).toBe(1);
    });
    it("counts the same selected items and units and marks undisclosed summaries unavailable", async () => {
      const f = await fixture();
      const target = { kind: "SHARE", access: f.access };
      const dashboard = await f.dashboard.get(null, target, { text: "ceramic" });
      expect(dashboard.selection).toEqual({ itemCount: 1, unitCount: "4" });
      expect(dashboard.values).toEqual({ state: "UNAVAILABLE", purchase: null, manual: null });
      expect(dashboard.trade).toBeNull();
      expect(dashboard.privatePairs).toBeNull();
      expect(dashboard.wishlist).toBeNull();
      const wire = JSON.stringify(dashboard);
      for (const hidden of [f.owner, f.collection.id, f.item.id, f.share.token!])
        expect(wire).not.toContain(hidden);
      expect((await f.dashboard.get(null, target, { text: "unmatched" })).selection).toEqual({
        itemCount: 0,
        unitCount: "0",
      });
    });
    it("executes granted value summaries and preserves empty versus missing states", async () => {
      const f = await fixture(true);
      const dashboard = await f.dashboard.get(null, { kind: "SHARE", access: f.access }, {});
      expect(dashboard.values.state).toBe("AVAILABLE");
      expect(dashboard.values.manual).toMatchObject({
        state: "NO_ESTIMATES",
        groups: [],
        contributors: { itemCount: 0, unitCount: "0" },
      });
      expect(dashboard.values.purchase).toMatchObject({ state: "UNAVAILABLE" });
    });
    it.each(["topSecret", "scopeSecret", "nullKind", "nullLifecycle"])(
      "rejects malformed or credential-bearing v2 rows at the actual database boundary: %s",
      async (variant) => {
        const f = await fixture();
        const value = structuredClone(f.definition) as Record<string, unknown>;
        if (variant === "topSecret") value.token = f.share.token;
        if (variant === "scopeSecret")
          value.scope = { ...f.definition.scope, accessToken: f.share.token };
        if (variant === "nullKind") value.scope = { kind: null, shareId: f.share.share.id };
        if (variant === "nullLifecycle") value.lifecycle = null;
        await expect(
          db.$executeRaw`INSERT INTO "SmartCollection" (id,"ownerId",name,"filterVersion",definition,revision,"createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${f.viewer},'Invalid synthetic row',1,${JSON.stringify(value)}::jsonb,1,now(),now())`,
        ).rejects.toMatchObject({ code: "P2010" });
      },
    );
    it("binds saved cursors to revisions and preserves explicit update conflicts", async () => {
      const f = await fixture();
      await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection.id, title: "Second ceramic" },
      });
      const saved = await f.saved.create(
        f.actor,
        { name: "Ceramics", definition: f.definition },
        f.access,
      );
      const page = await f.saved.resolve(f.actor, saved.id, { limit: 1 }, f.access);
      expect(page.nextCursor).toBeTruthy();
      const updated = await f.saved.update(
        f.actor,
        saved.id,
        { name: "All shared", definition: { ...f.definition, text: "" }, expectedRevision: 1 },
        f.access,
      );
      expect(updated.revision).toBe(2);
      await expect(
        f.saved.update(
          f.actor,
          saved.id,
          { name: "Stale", definition: f.definition, expectedRevision: 1 },
          f.access,
        ),
      ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
      await expect(
        f.saved.resolve(f.actor, saved.id, { limit: 1, cursor: page.nextCursor }, f.access),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      expect((await f.saved.list(f.actor)).items.map((i) => i.id)).toEqual([saved.id]);
    });
    it("sums actual granted latest manual points exactly, including zero and missing estimates", async () => {
      const f = await fixture(true);
      const second = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection.id,
          title: "Second ceramic",
          quantity: 2,
        },
      });
      await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection.id,
          title: "Missing estimate ceramic",
          quantity: 1,
        },
      });
      const valuations = createValuationService(db, f.owner);
      await valuations.addManualValuation(f.item.id, { amountMinor: 100n, currency: "EUR" });
      await valuations.addManualValuation(second.id, { amountMinor: 0n, currency: "EUR" });
      const result = await createScopedDashboardService(db, { canonicalMoneyEnabled: true }).get(
        null,
        { kind: "SHARE", access: f.access },
        {},
      );
      expect(result.selection).toEqual({ itemCount: 3, unitCount: "7" });
      expect(result.values.manual).toEqual({
        state: "PARTIAL",
        quantityBasis: "CURRENT_QUANTITY",
        contributors: { itemCount: 2, unitCount: "6" },
        missing: { itemCount: 1, unitCount: "1" },
        groups: [
          {
            currency: "EUR",
            minorUnitExponent: 2,
            totalMinor: "400",
            contributors: { itemCount: 2, unitCount: "6" },
          },
        ],
      });
      expect(result.values.purchase).toMatchObject({ state: "NO_PRICES" });
    });
    it("stores membership queries without secrets and reauthorizes after actual membership removal", async () => {
      const f = await fixture();
      const membership = createMembershipService(db);
      await membership.addMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
      );
      const definition = {
        ...f.definition,
        scope: { kind: "MEMBER_COLLECTION", collectionId: f.collection.id },
        lifecycle: "ACTIVE",
      };
      const saved = await f.saved.create(f.actor, { name: "Member workspace", definition });
      expect((await f.saved.resolve(f.actor, saved.id)).total).toBe(1);
      const overview = await f.dashboard.get(f.actor, definition.scope, { lifecycle: "ACTIVE" });
      expect(overview.trade).toEqual([
        { tradeStatus: "NOT_FOR_TRADE", itemCount: 1, unitCount: "4" },
      ]);
      expect(overview.values.state).toBe("UNAVAILABLE");
      await membership.removeMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, expectedRevision: 1 },
      );
      await expect(f.saved.resolve(f.actor, saved.id)).rejects.toMatchObject({
        code: "SMART_COLLECTION_UNRESOLVABLE",
      });
      await createSmartCollectionService(db).deleteSmartCollection(f.actor, saved.id, {
        expectedRevision: 1,
      });
      expect((await f.saved.list(f.actor)).total).toBe(0);
    });
    it("keeps owned saved discovery separate from explicitly scoped definitions", async () => {
      const f = await fixture();
      const shared = await f.saved.create(
        f.actor,
        { name: "Shared view", definition: f.definition },
        f.access,
      );
      const owned = await createSmartCollectionService(db).createSmartCollection(f.actor, {
        name: "Own view",
        definition: { version: 1, text: "", filter: null, lifecycle: "ACTIVE" },
      });
      expect(
        (await createSmartCollectionService(db).listSmartCollections(f.actor)).items.map(
          (item) => item.id,
        ),
      ).toEqual([owned.id]);
      expect((await f.saved.list(f.actor)).items.map((item) => item.id)).toEqual([shared.id]);
    });
  },
);
