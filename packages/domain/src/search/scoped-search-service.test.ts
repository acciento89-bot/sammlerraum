import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchRead } from "./search-read";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
} from "../money/legacy-money-store";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "../sharing/share-service";
import { createMembershipService } from "../collaboration/membership-service";
import { createScopedSearchService } from "./scoped-search-service";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual scoped search and whole-tree inference",
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
    async function fixture(permissions: Record<string, unknown> = {}) {
      const owner = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, viewer])
        await db.user.create({
          data: { id, name: "Scoped search", email: `${id}@example.invalid`, emailVerified: true },
        });
      const collection = await db.collection.create({ data: { ownerId: owner, name: "Selected" } });
      const other = await db.collection.create({ data: { ownerId: owner, name: "Hidden parent" } });
      const item = await db.collectibleItem.create({
        data: {
          ownerId: owner,
          collectionId: collection.id,
          title: "Shared pottery",
          publicDescription: "Blue glaze",
          privateNotes: "private-only-sentinel",
          quantity: 3,
        },
      });
      await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: other.id, title: "Hidden pottery" },
      });
      const shares = createShareService(db);
      const share = await shares.createShare(
        { userId: owner },
        {
          target: { kind: "COLLECTION", id: collection.id },
          recipient: { kind: "TOKEN" },
          permissions,
          expectedRevision: 0,
        },
      );
      return {
        owner,
        viewer,
        collection,
        other,
        item,
        shares,
        share,
        target: { kind: "SHARE" as const, access: { token: share.token! } },
        service: createScopedSearchService(db),
      };
    }
    const filter = (root: unknown) => ({ version: 1, root });
    it("executes allowed literal text over only the shared projection and returns a closed DTO", async () => {
      const f = await fixture();
      const page = await f.service.search(null, f.target, { text: "glaze" });
      expect(page.total).toBe(1);
      expect(page.items).toEqual([{ id: f.item.id, title: f.item.title, quantity: 3 }]);
      const wire = JSON.stringify(page);
      for (const hidden of [
        f.owner,
        f.collection.id,
        f.other.id,
        f.share.token!,
        "privateNotes",
        "createdAt",
        "archivedAt",
      ])
        expect(wire).not.toContain(hidden);
      expect(
        (await f.service.search(null, f.target, { text: "private-only-sentinel" })).total,
      ).toBe(0);
      expect((await f.service.search(null, f.target, { text: "Hidden pottery" })).total).toBe(0);
    });
    it.each([
      { kind: "duplicate", value: false },
      { kind: "purchaseMoney", test: { op: "missing" } },
      { kind: "media", mediaKind: "IMAGE", test: { op: "missing" } },
      { kind: "createdAt", test: { op: "eq", value: "2026-01-01T00:00:00.000Z" } },
      { kind: "collection", test: { op: "eq", value: randomUUID() } },
    ])("denies undisclosed fields before NOT/OR and empty matching: $kind", async (root) => {
      const f = await fixture();
      await expect(
        f.service.search(null, f.target, {
          text: "no match",
          filter: filter({
            kind: "or",
            children: [{ kind: "not", child: root }, structuredClone(root)],
          }),
        }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    });
    it("rejects hidden lifecycle inference while defaulting basic shares to ALL", async () => {
      const f = await fixture();
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { archivedAt: new Date() },
      });
      expect((await f.service.search(null, f.target, {})).total).toBe(1);
      await expect(f.service.search(null, f.target, { lifecycle: "ACTIVE" })).rejects.toMatchObject(
        { code: "FILTER_UNAVAILABLE" },
      );
    });
    it("binds ID-only pagination to actor, target, query and page size", async () => {
      const f = await fixture();
      await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection.id, title: "Second pottery" },
      });
      const first = await f.service.search(null, f.target, { limit: 1 });
      expect(first.total).toBe(2);
      expect(first.nextCursor).toBeTruthy();
      const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString());
      expect(Object.keys(decoded).sort()).toEqual(["after", "contextHash", "v"]);
      expect(decoded.after).toBe(first.items[0]!.id);
      const next = await f.service.search(null, f.target, { limit: 1, cursor: first.nextCursor });
      expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
      expect(next.nextCursor).toBeNull();
      await expect(
        f.service.search(null, f.target, { limit: 2, cursor: first.nextCursor }),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      await expect(
        f.service.search({ userId: f.viewer }, f.target, { limit: 1, cursor: first.nextCursor }),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    });
    it("allows current member workspace fields without granting private money or unknown references", async () => {
      const f = await fixture();
      await createMembershipService(db).addMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
      );
      const target = { kind: "MEMBER_COLLECTION", collectionId: f.collection.id };
      const page = await f.service.search({ userId: f.viewer }, target, {
        filter: filter({ kind: "visibility", test: { op: "eq", value: "PRIVATE" } }),
        lifecycle: "ACTIVE",
      });
      expect(page.total).toBe(1);
      await expect(
        f.service.search({ userId: f.viewer }, target, {
          filter: filter({ kind: "collection", test: { op: "eq", value: f.other.id } }),
        }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
      await expect(
        f.service.search({ userId: f.viewer }, target, {
          filter: filter({ kind: "purchaseMoney", test: { op: "missing" } }),
        }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    });
    it("executes explicitly granted money presence while preserving missing versus zero", async () => {
      const f = await fixture({ values: true });
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { purchaseAmountMinor: 0n, purchaseCurrency: "EUR" },
      });
      expect(
        (
          await f.service.search(null, f.target, {
            filter: filter({ kind: "purchaseMoney", test: { op: "present" } }),
          })
        ).total,
      ).toBe(1);
      expect(
        (
          await f.service.search(null, f.target, {
            filter: filter({ kind: "purchaseMoney", test: { op: "missing" } }),
          })
        ).total,
      ).toBe(0);
    });
    it("executes granted image absence without returning any private asset identifiers", async () => {
      const f = await fixture({ images: true });
      expect(
        (
          await f.service.search(null, f.target, {
            filter: filter({ kind: "media", mediaKind: "IMAGE", test: { op: "missing" } }),
          })
        ).total,
      ).toBe(1);
    });
    it("rejects raw oversized queries and unknown owner/role keys", async () => {
      const f = await fixture();
      for (const query of [
        { text: "x".repeat(201) },
        { ownerId: f.owner },
        { role: "OWNER" },
        { text: "x", scope: "OWNED" },
      ])
        await expect(f.service.search(null, f.target, query)).rejects.toMatchObject({
          code: "SEARCH_INVALID",
        });
    });
    it("checks complete monetary provenance in exactly the granted target, not hidden inventory", async () => {
      const f = await fixture({ values: true });
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { purchaseAmountMinor: 0n, purchaseCurrency: "EUR" },
      });
      await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.other.id,
          title: "Unclassified private cost",
          purchaseAmountMinor: 425n,
          purchaseCurrency: "EUR",
        },
      });
      await runSearchRead(db, async (tx) => {
        const subject = { family: "PURCHASE" as const, itemId: f.item.id },
          actor = { userId: f.owner };
        const current = await readMoneyFact(tx, subject, actor);
        const fact = await requireMoneyToken(tx, subject, actor, current.factToken);
        await appendMoneyAssertion(tx, fact, {
          kind: "CLASSIFY",
          input: {
            expectedFactToken: current.factToken,
            exponent: 2,
            unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:EUR" },
            evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic receipt" },
          },
        });
      });
      const query = {
        filter: filter({
          kind: "purchaseMoney",
          test: {
            op: "range",
            minMinor: "0",
            maxMinor: "0",
            unit: { currency: "EUR", minorUnitExponent: 2, unitKey: "iso4217-2026-09-17:EUR" },
          },
        }),
      };
      const enabled = createScopedSearchService(db, { canonicalMoneyEnabled: true });
      expect((await enabled.search(null, f.target, query)).total).toBe(1);
      await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection.id,
          title: "Unknown cost inside grant",
          purchaseAmountMinor: 100n,
          purchaseCurrency: "EUR",
        },
      });
      await expect(enabled.search(null, f.target, query)).rejects.toMatchObject({
        code: "FILTER_UNAVAILABLE",
      });
    });
    it("does not skip field checks on a genuinely empty shared collection", async () => {
      const f = await fixture();
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { deletedAt: new Date() },
      });
      expect((await f.service.search(null, f.target, {})).total).toBe(0);
      await expect(
        f.service.search(null, f.target, { filter: filter({ kind: "duplicate", value: false }) }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    });
    it("holds count and page in the same real snapshot during a concurrent insert", async () => {
      const f = await fixture();
      let inserted = false;
      const measured = {
        $transaction: <T>(
          work: (tx: { $queryRaw<R>(query: Prisma.Sql): Promise<R> }) => Promise<T>,
          options: {
            isolationLevel: "ReadCommitted" | "RepeatableRead";
            maxWait: number;
            timeout: number;
          },
        ) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <R>(query: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<R>(query);
                  if (!inserted && query.text.includes("SELECT count(*) AS total")) {
                    inserted = true;
                    await db.collectibleItem.create({
                      data: {
                        ownerId: f.owner,
                        collectionId: f.collection.id,
                        title: "Concurrent new item",
                      },
                    });
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      const page = await createScopedSearchService(measured).search(null, f.target, {});
      expect(inserted).toBe(true);
      expect(page.total).toBe(1);
      expect(page.items).toHaveLength(1);
      expect((await f.service.search(null, f.target, {})).total).toBe(2);
    });
    it("counts only individually granted documents and denies ungranted receipt categories", async () => {
      const f = await fixture();
      const second = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection.id, title: "Only private document" },
      });
      async function document(itemId: string) {
        const asset = await db.mediaAsset.create({
          data: {
            ownerId: f.owner,
            kind: "DOCUMENT",
            status: "READY",
            storageKey: `synthetic/${randomUUID()}`,
            mimeType: "application/pdf",
            byteSize: 128n,
            checksumSha256: "a".repeat(64),
            originalFileName: "synthetic.pdf",
          },
        });
        return db.documentLink.create({
          data: {
            ownerId: f.owner,
            itemId,
            assetId: asset.id,
            position: 0,
            category: "OTHER_PRIVATE",
          },
        });
      }
      const selected = await document(f.item.id);
      await document(second.id);
      const grant = await f.shares.createShare(
        { userId: f.owner },
        {
          target: { kind: "COLLECTION", id: f.collection.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { documents: [selected.id] },
        },
      );
      const target = { kind: "SHARE", access: { token: grant.token! } };
      const present = await f.service.search(null, target, {
        filter: filter({ kind: "media", mediaKind: "DOCUMENT", test: { op: "present" } }),
      });
      expect(present.items.map((i) => i.id)).toEqual([f.item.id]);
      const missing = await f.service.search(null, target, {
        filter: filter({ kind: "media", mediaKind: "DOCUMENT", test: { op: "missing" } }),
      });
      expect(missing.items.map((i) => i.id)).toEqual([second.id]);
      await expect(
        f.service.search(null, target, {
          filter: filter({
            kind: "media",
            mediaKind: "DOCUMENT",
            documentCategory: "PURCHASE_RECEIPT",
            test: { op: "missing" },
          }),
        }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
      expect(JSON.stringify(present)).not.toContain(selected.id);
    });
    it("retains recursive scope for actual purchase coverage subqueries", async () => {
      const f = await fixture();
      const node = await db.collectionNode.create({
        data: { collectionId: f.collection.id, name: "Selected branch" },
      });
      await db.collectibleItem.update({ where: { id: f.item.id }, data: { nodeId: node.id } });
      await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection.id,
          title: "Unknown outside subtree",
          purchaseAmountMinor: 100n,
          purchaseCurrency: "EUR",
        },
      });
      const grant = await f.shares.createShare(
        { userId: f.owner },
        {
          target: { kind: "NODE", id: node.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { values: true },
        },
      );
      const page = await createScopedSearchService(db, { canonicalMoneyEnabled: true }).search(
        null,
        { kind: "SHARE", access: { token: grant.token! } },
        {
          filter: filter({
            kind: "purchaseMoney",
            test: {
              op: "range",
              minMinor: "0",
              unit: { currency: "EUR", minorUnitExponent: 2, unitKey: "iso4217-2026-09-17:EUR" },
            },
          }),
        },
      );
      expect(page.total).toBe(0);
    });
  },
);
