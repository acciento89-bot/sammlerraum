import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMembershipService } from "../collaboration/membership-service";
import { authorize } from "../authz/policy";
import { createTrustedActorFacts } from "../authz/types";
import { createShareService } from "./share-service";
const storageDirectories: string[] = [];
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = randomUUID(),
    viewer = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, viewer, outsider])
    await db.user.create({
      data: {
        id,
        name: "Own sharing fixture",
        email: `${id}@example.invalid`,
        emailVerified: true,
      },
    });
  const collection = await db.collection.create({
    data: { ownerId: owner, name: "Private owned sharing collection" },
  });
  const item = await db.collectibleItem.create({
    data: {
      ownerId: owner,
      collectionId: collection.id,
      title: "Selected shared item",
      publicDescription: "Explicitly shared description",
      privateNotes: "private-note-sentinel",
      purchaseAmountMinor: 425n,
      purchaseCurrency: "EUR",
    },
  });
  return {
    owner,
    viewer,
    outsider,
    collection: collection.id,
    item,
    actor: { userId: owner },
    service: createShareService(db),
  };
}
async function documentFixture() {
  const f = await fixture(),
    dir = await mkdtemp(join(tmpdir(), "sammlerraum-owned-share-"));
  storageDirectories.push(dir);
  const storage = new LocalPersistentStorage(dir),
    bytes = Buffer.from("%PDF-1.7\nOwned share native fixture\n%%EOF"),
    key = `originals/${randomUUID()}`;
  await storage.put(key, bytes);
  const asset = await db.mediaAsset.create({
    data: {
      ownerId: f.owner,
      kind: "DOCUMENT",
      status: "READY",
      storageKey: key,
      mimeType: "application/pdf",
      byteSize: BigInt(bytes.byteLength),
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      originalFileName: "not-disclosed.pdf",
    },
  });
  const link = await db.documentLink.create({
    data: {
      ownerId: f.owner,
      itemId: f.item.id,
      assetId: asset.id,
      position: 0,
      title: "Selected native proof",
    },
  });
  return { ...f, storage, bytes, key, asset, link };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual explicit granular read shares",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      for (const dir of storageDirectories) await rm(dir, { recursive: true, force: true });
    });
    it("excludes private notes, location, insurance, receipt and money data by default and stores only a token hash", async () => {
      const f = await fixture();
      const share = await f.service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
      });
      expect(share.share.permissions).toMatchObject({
        readOnly: true,
        privateNotes: false,
        storageLocation: false,
        insurance: false,
        purchaseReceipts: false,
        values: false,
        export: false,
        documents: [],
      });
      expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [stored] = await db.$queryRaw<
        { tokenHash: string }[]
      >`SELECT "tokenHash" FROM "CollectionShare" WHERE id=${share.share.id}::uuid`;
      expect(stored!.tokenHash).toBe(createHash("sha256").update(share.token!).digest("hex"));
      const view = await f.service.resolveShare(null, { token: share.token });
      expect(view.data.items).toEqual([
        expect.objectContaining({ id: f.item.id, title: "Selected shared item" }),
      ]);
      expect(JSON.stringify(view.data)).not.toMatch(
        /private-note-sentinel|purchaseAmountMinor|purchaseCurrency|storageLocation|policyNumber|tokenHash/,
      );
      expect(JSON.stringify(view.data)).not.toContain(f.owner);
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("stops a known token immediately after revocation", async () => {
      const f = await fixture(),
        created = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      await f.service.revokeShare(f.actor, {
        shareId: created.share.id,
        expectedRevision: created.share.revision,
      });
      await expect(f.service.resolveShare(null, { token: created.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
    });
    it("binds registered-user grants without adding membership or broadening a Viewer's edit rights", async () => {
      const f = await fixture(),
        members = createMembershipService(db);
      await members.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.viewer,
        role: "VIEWER",
        expectedRevision: 0,
      });
      const created = await f.service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "USER", userId: f.viewer },
        expectedRevision: 1,
        permissions: { privateNotes: true },
      });
      expect(created.token).toBeUndefined();
      await expect(
        f.service.resolveShare(null, { shareId: created.share.id }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      await expect(
        f.service.resolveShare({ userId: f.outsider }, { shareId: created.share.id }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      const view = await f.service.resolveShare(
        { userId: f.viewer },
        { shareId: created.share.id },
      );
      expect(view.data.items[0]!.privateNotes).toBe("private-note-sentinel");
      const facts = await members.getCollectionAuthorizationFacts(
        { userId: f.viewer },
        f.collection,
      );
      expect(
        authorize(
          createTrustedActorFacts({ type: "AUTHENTICATED", userId: f.viewer }),
          "collection.edit",
          facts,
        ).allowed,
      ).toBe(false);
      expect((await members.getMembershipState(f.actor, f.collection)).members).toContainEqual({
        userId: f.viewer,
        role: "VIEWER",
      });
    });
    it("resolves the selected node subtree without exposing siblings or other private ancestors", async () => {
      const f = await fixture();
      const parent = await db.collectionNode.create({
        data: { collectionId: f.collection, name: "Private outside ancestor" },
      });
      const node = await db.collectionNode.create({
        data: { collectionId: f.collection, parentId: parent.id, name: "Chosen subtree" },
      });
      const child = await db.collectionNode.create({
        data: { collectionId: f.collection, parentId: node.id, name: "Chosen child" },
      });
      const sibling = await db.collectionNode.create({
        data: { collectionId: f.collection, parentId: parent.id, name: "Unshared sibling" },
      });
      const items = [];
      for (const n of [node, child, sibling])
        items.push(
          await db.collectibleItem.create({
            data: { ownerId: f.owner, collectionId: f.collection, nodeId: n.id, title: n.name },
          }),
        );
      const created = await f.service.createShare(f.actor, {
        target: { kind: "NODE", id: node.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
      });
      const view = await f.service.resolveShare(null, { token: created.token });
      expect(view.data.items.map((item) => item.id).sort()).toEqual(
        items
          .slice(0, 2)
          .map((item) => item.id)
          .sort(),
      );
      expect(JSON.stringify(view.data)).not.toMatch(/Unshared sibling|Private outside ancestor/);
    });
    it("permanently revokes the old owner's token during transfer, including a later ownership round trip", async () => {
      const f = await fixture(),
        created = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        }),
        members = createMembershipService(db);
      await members.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.viewer,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.viewer,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      await expect(f.service.resolveShare(null, { token: created.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
      await members.transferOwnership(
        { userId: f.viewer },
        {
          collectionId: f.collection,
          newOwnerId: f.owner,
          expectedRevision: 2,
          confirmPrivateTransfer: true,
        },
      );
      await expect(f.service.resolveShare(null, { token: created.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
    });
    it("rejects a genuinely expired stored grant using the database clock", async () => {
      const f = await fixture(),
        id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await db.$executeRaw`INSERT INTO "CollectionShare" (id,"collectionId","creatorUserId","targetKind","targetId","tokenHash",permissions,"createdAt","expiresAt") VALUES (${id}::uuid,${f.collection}::uuid,${f.owner},'ITEM',${f.item.id}::uuid,${createHash("sha256").update(token).digest("hex")},'{"readOnly":true}'::jsonb,timezone('UTC',clock_timestamp())-interval '2 hours',timezone('UTC',clock_timestamp())-interval '1 hour')`;
      await expect(f.service.resolveShare(null, { token })).rejects.toMatchObject({
        code: "SHARE_EXPIRED",
      });
    });
    it("stores a salted PIN hash and persists a bounded attempt budget before expensive checking", async () => {
      const f = await fixture(),
        created = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          pin: "638251",
        });
      const [stored] = await db.$queryRaw<
        { pinHash: string }[]
      >`SELECT "pinHash" FROM "CollectionShare" WHERE id=${created.share.id}::uuid`;
      expect(stored!.pinHash).not.toContain("638251");
      await expect(f.service.resolveShare(null, { token: created.token })).rejects.toMatchObject({
        code: "SHARE_PIN_REQUIRED",
      });
      expect(
        (await f.service.resolveShare(null, { token: created.token, pin: "638251" })).data.items[0]!
          .id,
      ).toBe(f.item.id);
      for (let i = 0; i < 4; i++)
        await expect(
          f.service.resolveShare(null, { token: created.token, pin: "000000" }),
        ).rejects.toMatchObject({ code: "SHARE_PIN_INVALID" });
      // A fresh service instance cannot reset a persistent budget.
      await expect(
        createShareService(db).resolveShare(null, { token: created.token, pin: "638251" }),
      ).rejects.toMatchObject({ code: "SHARE_RATE_LIMITED" });
      await f.service.revokeShare(f.actor, { shareId: created.share.id, expectedRevision: 0 });
      await expect(
        f.service.resolveShare(null, { token: created.token, pin: "638251" }),
      ).rejects.toMatchObject({ code: "SHARE_REVOKED" });
    });

    it("discloses only explicitly selected location, policy, values and document metadata", async () => {
      const f = await fixture();
      const location = await db.storageLocation.create({
        data: {
          ownerId: f.owner,
          name: "Selected private cabinet",
          type: "CABINET",
          qrToken: randomBytes(32).toString("base64url"),
        },
      });
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { storageLocationId: location.id },
      });
      await db.insuranceRecord.create({
        data: {
          ownerId: f.owner,
          itemId: f.item.id,
          basis: "PER_UNIT",
          valuationDate: new Date("2026-11-01T00:00:00.000Z"),
          amountMinor: 25000n,
          currency: "EUR",
          minorUnitExponent: 2,
          policyReference: "selected-policy",
          insurer: "Selected insurer",
        },
      });
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.owner,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `private/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 10n,
          checksumSha256: "a".repeat(64),
          originalFileName: "private-original.pdf",
        },
      });
      const selected = await db.documentLink.create({
        data: {
          ownerId: f.owner,
          itemId: f.item.id,
          assetId: asset.id,
          category: "PURCHASE_RECEIPT",
          position: 0,
          title: "Selected receipt",
        },
      });
      await expect(
        f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { documents: [selected.id] },
        }),
      ).rejects.toMatchObject({ code: "SHARE_INVALID" });
      const created = await f.service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
        permissions: {
          storageLocation: true,
          insurance: true,
          values: true,
          purchaseReceipts: true,
          documents: [selected.id],
        },
      });
      const result = await f.service.resolveShare(null, { token: created.token }),
        item = result.data.items[0]!;
      expect(item).toMatchObject({
        storageLocation: { name: "Selected private cabinet", type: "CABINET" },
        insurance: {
          amountMinor: "25000",
          currency: "EUR",
          minorUnitExponent: 2,
          policyReference: "selected-policy",
        },
        purchase: {
          raw: { amountMinor: "425", currency: "EUR" },
          interpretation: { kind: "UNKNOWN" },
        },
        documents: [
          {
            id: selected.id,
            title: "Selected receipt",
            category: "PURCHASE_RECEIPT",
            mimeType: "application/pdf",
          },
        ],
      });
      expect(JSON.stringify(result.data)).not.toMatch(
        /private-original|private\/|private-note-sentinel|creatorUserId|factToken|actorId|evidenceReference/,
      );
    });
    it("cannot select a document belonging to a different item or a sibling outside the chosen subtree", async () => {
      const f = await fixture(),
        other = await db.collectibleItem.create({
          data: { ownerId: f.owner, collectionId: f.collection, title: "Outside selected item" },
        });
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.owner,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `private/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 10n,
          checksumSha256: "a".repeat(64),
          originalFileName: "outside.pdf",
        },
      });
      const link = await db.documentLink.create({
        data: { ownerId: f.owner, itemId: other.id, assetId: asset.id, position: 0 },
      });
      await expect(
        f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { documents: [link.id] },
        }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
    });
    it("pages collections with stable bounded cursors and no duplicate or missing item", async () => {
      const f = await fixture();
      await db.collectibleItem.createMany({
        data: Array.from({ length: 104 }, (_, i) => ({
          ownerId: f.owner,
          collectionId: f.collection,
          title: `Paged ${i}`,
        })),
      });
      const created = await f.service.createShare(f.actor, {
        target: { kind: "COLLECTION", id: f.collection },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
      });
      const a = await f.service.resolveShare(null, { token: created.token }),
        b = await f.service.resolveShare(null, { token: created.token, after: a.data.next! });
      expect(a.data.items).toHaveLength(100);
      expect(b.data.items).toHaveLength(5);
      expect(b.data.next).toBeNull();
      expect(new Set([...a.data.items, ...b.data.items].map((i) => i.id)).size).toBe(105);
    });

    it("reuses a short-lived PIN session for selected proof bytes without repeated PIN attempts", async () => {
      const f = await documentFixture(),
        service = createShareService(db, f.storage);
      const created = await service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
        pin: "638251",
        permissions: { documents: [f.link.id] },
      });
      const opened = await service.resolveShare(null, { token: created.token, pin: "638251" });
      expect(opened.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      for (let i = 0; i < 7; i++)
        expect(
          (
            await service.resolveShare(null, {
              token: created.token,
              accessToken: opened.accessToken,
            })
          ).data.items[0]!.id,
        ).toBe(f.item.id);
      const result = await service.readSharedAsset(null, {
        access: { token: created.token, accessToken: opened.accessToken },
        kind: "DOCUMENT",
        linkId: f.link.id,
      });
      expect(Buffer.from(result.bytes)).toEqual(f.bytes);
      expect(result.mimeType).toBe("application/pdf");
      await expect(
        service.readSharedAsset(null, {
          access: { token: created.token, accessToken: opened.accessToken },
          kind: "IMAGE",
          linkId: f.link.id,
        }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      const [budget] = await db.$queryRaw<
        { attempts: number }[]
      >`SELECT attempts FROM "SharePinBudget" WHERE "shareId"=${created.share.id}::uuid`;
      expect(budget!.attempts).toBe(1);
    });
    it("reauthorizes after actual storage I/O and refuses bytes if the share was revoked during the read", async () => {
      const f = await documentFixture(),
        created = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { documents: [f.link.id] },
        });
      const service = createShareService(db, {
        read: async (key, options) => {
          const bytes = await f.storage.read(key, options);
          await f.service.revokeShare(f.actor, { shareId: created.share.id, expectedRevision: 0 });
          return bytes;
        },
      });
      await expect(
        service.readSharedAsset(null, {
          access: { token: created.token },
          kind: "DOCUMENT",
          linkId: f.link.id,
        }),
      ).rejects.toMatchObject({ code: "SHARE_REVOKED" });
    });
    it("does not turn an image permission into a private document download", async () => {
      const f = await documentFixture(),
        service = createShareService(db, f.storage),
        created = await service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { images: true },
        });
      await expect(
        service.readSharedAsset(null, {
          access: { token: created.token },
          kind: "DOCUMENT",
          linkId: f.link.id,
        }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      await expect(
        service.readSharedAsset(null, {
          access: { token: created.token },
          kind: "IMAGE",
          linkId: f.link.id,
        }),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
    });

    it("exports the same minimal selected fields only when explicitly enabled", async () => {
      const f = await fixture(),
        closed = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      await expect(f.service.exportShare(null, { token: closed.token })).rejects.toMatchObject({
        code: "SHARE_FORBIDDEN",
      });
      const enabled = await f.service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
        permissions: { export: true },
      });
      const result = await f.service.exportShare(null, { token: enabled.token });
      expect(result.mimeType).toBe("application/json");
      expect(JSON.parse(Buffer.from(result.bytes).toString()).items).toEqual([
        expect.objectContaining({ id: f.item.id, title: f.item.title }),
      ]);
      expect(Buffer.from(result.bytes).toString()).not.toMatch(
        /private-note-sentinel|purchase|policy|tokenHash|creatorUserId/,
      );
    });
    it("does not reuse a PIN session for a different grant and rejects an expired session", async () => {
      const f = await fixture(),
        input = {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          pin: "638251",
        };
      const first = await f.service.createShare(f.actor, input),
        second = await f.service.createShare(f.actor, input),
        opened = await f.service.resolveShare(null, { token: first.token, pin: "638251" });
      await expect(
        f.service.resolveShare(null, { token: second.token, accessToken: opened.accessToken }),
      ).rejects.toMatchObject({ code: "SHARE_PIN_REQUIRED" });
      await db.$executeRaw`UPDATE "ShareAccessSession" SET "expiresAt"=timezone('UTC',clock_timestamp())-interval '1 second' WHERE "shareId"=${first.share.id}::uuid`;
      await expect(
        f.service.resolveShare(null, { token: first.token, accessToken: opened.accessToken }),
      ).rejects.toMatchObject({ code: "SHARE_PIN_REQUIRED" });
    });
    it("serializes concurrent creation at the 100-active-grant boundary", async () => {
      const f = await fixture();
      await db.$executeRaw`INSERT INTO "CollectionShare" (id,"collectionId","creatorUserId","targetKind","targetId","tokenHash",permissions) SELECT gen_random_uuid(),${f.collection}::uuid,${f.owner},'COLLECTION',${f.collection}::uuid,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'{"readOnly":true}'::jsonb FROM generate_series(1,99)`;
      const input = {
        target: { kind: "COLLECTION", id: f.collection },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
      };
      const result = await Promise.allSettled([
        f.service.createShare(f.actor, input),
        f.service.createShare(f.actor, input),
      ]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        result
          .filter((r) => r.status === "rejected")
          .map((r) => (r.status === "rejected" ? r.reason.code : null)),
      ).toEqual(["SHARE_LIMIT_EXCEEDED"]);
      const [count] = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM "CollectionShare" WHERE "collectionId"=${f.collection}::uuid`;
      expect(count!.count).toBe(100n);
    });
    it("guards immutable disclosure permissions and prevents restoring a revoked grant through SQL", async () => {
      const f = await fixture(),
        created = await f.service.createShare(f.actor, {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      await expect(
        db.$executeRaw`UPDATE "CollectionShare" SET permissions=permissions||'{"privateNotes":true}'::jsonb WHERE id=${created.share.id}::uuid`,
      ).rejects.toThrow();
      await f.service.revokeShare(f.actor, { shareId: created.share.id, expectedRevision: 0 });
      await expect(
        db.$executeRaw`UPDATE "CollectionShare" SET "revokedAt"=NULL,revision=revision+1 WHERE id=${created.share.id}::uuid`,
      ).rejects.toThrow();
      await expect(f.service.resolveShare(null, { token: created.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
    });
    it("shares collection insurance only for an explicitly selected whole collection, never a child subtree", async () => {
      const f = await fixture();
      await db.insuranceRecord.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection,
          basis: "COLLECTION_TOTAL",
          valuationDate: new Date("2026-11-01T00:00:00Z"),
          amountMinor: 45000n,
          currency: "EUR",
          minorUnitExponent: 2,
          policyReference: "selected-collection-policy",
        },
      });
      const create = (kind: "COLLECTION" | "NODE", id: string, insurance = false) =>
        f.service.createShare(f.actor, {
          target: { kind, id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { insurance, export: true },
        });
      const plain = await create("COLLECTION", f.collection);
      expect((await f.service.resolveShare(null, { token: plain.token })).data).not.toHaveProperty(
        "insurance",
      );
      const selected = await create("COLLECTION", f.collection, true);
      expect((await f.service.resolveShare(null, { token: selected.token })).data).toMatchObject({
        insurance: {
          amountMinor: "45000",
          basis: "COLLECTION_TOTAL",
          policyReference: "selected-collection-policy",
        },
      });
      const exported = await f.service.exportShare(null, { token: selected.token });
      expect(JSON.parse(Buffer.from(exported.bytes).toString())).toMatchObject({
        insurance: { amountMinor: "45000" },
      });
      const node = await db.collectionNode.create({
          data: { collectionId: f.collection, name: "Child only" },
        }),
        child = await create("NODE", node.id, true);
      expect((await f.service.resolveShare(null, { token: child.token })).data).not.toHaveProperty(
        "insurance",
      );
    });
    it("delivers actual selected image bytes while keeping storage keys and unselected documents private", async () => {
      const f = await documentFixture(),
        bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
        key = `originals/${randomUUID()}`;
      await f.storage.put(key, bytes);
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.owner,
          kind: "IMAGE",
          status: "READY",
          storageKey: key,
          mimeType: "image/png",
          byteSize: BigInt(bytes.byteLength),
          checksumSha256: createHash("sha256").update(bytes).digest("hex"),
          originalFileName: "not-disclosed-image.png",
          width: 1,
          height: 1,
        },
      });
      const link = await db.mediaLink.create({
          data: { ownerId: f.owner, itemId: f.item.id, assetId: asset.id, position: 0 },
        }),
        service = createShareService(db, f.storage);
      const created = await service.createShare(f.actor, {
        target: { kind: "ITEM", id: f.item.id },
        recipient: { kind: "TOKEN" },
        expectedRevision: 0,
        permissions: { images: true },
      });
      const opened = await service.resolveShare(null, { token: created.token });
      expect(opened.data.items[0]!.images).toEqual([
        { id: link.id, title: null, mimeType: "image/png", width: 1, height: 1 },
      ]);
      expect(JSON.stringify(opened.data)).not.toMatch(
        /storageKey|not-disclosed-image|Selected native proof/,
      );
      const result = await service.readSharedAsset(null, {
        access: { token: created.token },
        kind: "IMAGE",
        linkId: link.id,
      });
      expect(result.mimeType).toBe("image/png");
      expect(Buffer.from(result.bytes)).toEqual(bytes);
    });
  },
);
