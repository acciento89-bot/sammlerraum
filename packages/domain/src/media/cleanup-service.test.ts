import sharp from "sharp";
import { createItemService } from "../items/item-service";
import { createImageProcessor } from "../../../../apps/worker/src/jobs/process-image";
import { createPrismaImageRepository } from "../../../../apps/worker/src/jobs/image-repository";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { describe, expect, it } from "vitest";
import { createMediaService } from "./media-service";
import { createMediaReadService } from "./media-read";
import { createMediaCleanupService } from "./cleanup-service";
import { createMediaCleanupJob } from "../../../../apps/worker/src/jobs/cleanup-media";

describe("media cleanup", () => {
  it("exposes the cleanup service", () => expect(createMediaCleanupService).toBeTypeOf("function"));
});

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("retention on real PostgreSQL", () => {
  async function fixture() {
    const appName = `cleanup-${randomUUID()}`;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("application_name", appName);
    const db = createTestDatabaseClient({ databaseUrl: url.href });
    const ownerId = randomUUID();
    const root = await mkdtemp(join(tmpdir(), "retention-"));
    await db.user.create({
      data: { id: ownerId, name: "Owner", email: `${ownerId}@example.test` },
    });
    const collection = await db.collection.create({ data: { ownerId, name: "Collection" } });
    const item = await db.collectibleItem.create({
      data: { ownerId, collectionId: collection.id, title: "Item" },
    });
    const asset = await db.mediaAsset.create({
      data: {
        ownerId,
        kind: "IMAGE",
        status: "READY",
        storageKey: `originals/${randomUUID()}`,
        mimeType: "image/jpeg",
        byteSize: 1n,
        checksumSha256: "a".repeat(64),
        originalFileName: "test.jpg",
      },
    });
    const storage = new LocalPersistentStorage(root);
    await storage.put(asset.storageKey, new Uint8Array([1]));
    const service = createMediaCleanupService(db, { retentionHours: 1 });
    const cleanup = createMediaCleanupJob(service, storage, async (_id, work) => work(), {
      error: () => {},
    });
    const close = async () => {
      await db.userProfile.deleteMany({ where: { userId: ownerId } });
      await db.mediaLink.deleteMany({ where: { ownerId } });
      await db.documentLink.deleteMany({ where: { ownerId } });
      await db.mediaVariant.deleteMany({ where: { assetId: asset.id } });
      await db.mediaAsset.deleteMany({ where: { ownerId } });
      await db.mediaCleanupKey.deleteMany({ where: { assetId: asset.id } });
      await db.collectibleItem.deleteMany({ where: { ownerId } });
      await db.collection.deleteMany({ where: { ownerId } });
      await db.user.delete({ where: { id: ownerId } });
      await db.$disconnect();
      await rm(root, { recursive: true, force: true });
    };
    return { db, appName, ownerId, item, asset, service, cleanup, storage, close };
  }

  it("does not delete bytes while another media, private document, or avatar reference exists", async () => {
    const f = await fixture();
    try {
      const first = await f.db.mediaLink.create({
        data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
      });
      const second = await f.db.documentLink.create({
        data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
      });
      await f.db.userProfile.create({
        data: {
          userId: f.ownerId,
          handle: randomUUID(),
          displayName: "Owner",
          avatarAssetId: f.asset.id,
        },
      });
      await f.service.unlinkAsset(f.ownerId, "ITEM", first.id, f.item.id);
      await f.cleanup.run();
      expect(await f.storage.exists(f.asset.storageKey)).toBe(true);
      expect(
        (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).orphanedAt,
      ).toBeNull();
      await f.service.unlinkAsset(f.ownerId, "ITEM_DOCUMENT", second.id, f.item.id);
      await f.cleanup.run();
      expect(await f.storage.exists(f.asset.storageKey)).toBe(true);
      await f.service.unlinkAsset(f.ownerId, "AVATAR", f.ownerId);
      expect(await f.service.findDeletableAssets()).toEqual([]);
      await f.db.mediaAsset.update({
        where: { id: f.asset.id },
        data: { orphanedAt: new Date(0) },
      });
      await f.cleanup.run();
      expect(await f.storage.exists(f.asset.storageKey)).toBe(false);
      expect(await f.db.mediaAsset.findUnique({ where: { id: f.asset.id } })).toBeNull();
      expect(await f.db.mediaCleanupKey.count({ where: { assetId: f.asset.id } })).toBe(4);
    } finally {
      await f.close();
    }
  });

  it("serializes a reference introduced after candidate discovery and blocks relinking during deletion", async () => {
    const f = await fixture();
    try {
      await f.db.mediaAsset.update({
        where: { id: f.asset.id },
        data: { orphanedAt: new Date(0) },
      });
      expect(await f.service.findDeletableAssets()).toContain(f.asset.id);
      const link = await f.db.mediaLink.create({
        data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
      });
      expect(await f.service.prepareDeletion(f.asset.id)).toBeNull();
      await expect(
        f.service.unlinkAsset("foreign", "ITEM", link.id, f.item.id),
      ).rejects.toMatchObject({ code: "LINK_NOT_FOUND" });
      expect(await f.db.mediaLink.count({ where: { id: link.id } })).toBe(1);
      await f.service.unlinkAsset(f.ownerId, "ITEM", link.id, f.item.id);
      await f.db.mediaAsset.update({
        where: { id: f.asset.id },
        data: { orphanedAt: new Date(0) },
      });
      expect(await f.service.prepareDeletion(f.asset.id)).toContain(f.asset.storageKey);
      await expect(
        f.db.mediaLink.create({
          data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      await expect(
        f.db.userProfile.create({
          data: {
            userId: f.ownerId,
            handle: randomUUID(),
            displayName: "Owner",
            avatarAssetId: f.asset.id,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    } finally {
      await f.close();
    }
  });

  it("serializes simultaneous final unlinks and maintains orphan state after rollback", async () => {
    const f = await fixture();
    try {
      const links = await Promise.all(
        ["GALLERY", "DETAIL"].map((purpose) =>
          f.db.mediaLink.create({
            data: {
              assetId: f.asset.id,
              ownerId: f.ownerId,
              itemId: f.item.id,
              position: 0,
              purpose: purpose as "GALLERY" | "DETAIL",
            },
          }),
        ),
      );
      await Promise.all(
        links.map((link) => f.service.unlinkAsset(f.ownerId, "ITEM", link.id, f.item.id)),
      );
      const orphan = await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } });
      expect(orphan.orphanedAt).toBeInstanceOf(Date);
      await expect(
        f.db.$transaction(async (tx) => {
          await tx.mediaLink.create({
            data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
          });
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      expect(
        (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).orphanedAt,
      ).toEqual(orphan.orphanedAt);
    } finally {
      await f.close();
    }
  });
  it.each(["reference", "cleanup"] as const)(
    "serializes the actual concurrent %s-first reference/deletion race",
    async (winner) => {
      const f = await fixture();
      let release!: () => void, entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const didEnter = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocker = f.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id = ${f.asset.id}::uuid FOR UPDATE`;
          await tx.mediaAsset.update({
            where: { id: f.asset.id },
            data: { orphanedAt: new Date(0) },
          });
          entered();
          await held;
        },
        { timeout: 15000 },
      );
      const waitForBlocked = async (count: number) => {
        await expect
          .poll(
            async () => {
              const rows = await f.db.$queryRaw<
                Array<{ count: bigint }>
              >`SELECT count(*) FROM pg_stat_activity WHERE application_name = ${f.appName} AND wait_event_type = 'Lock'`;
              return Number(rows[0]!.count);
            },
            { timeout: 5000, interval: 10 },
          )
          .toBe(count);
      };
      const link = () =>
        f.db.mediaLink
          .create({
            data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
          })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
      let ref: ReturnType<typeof link> | undefined;
      let deletion: ReturnType<typeof f.service.prepareDeletion> | undefined;
      try {
        await didEnter;
        if (winner === "reference") ref = link();
        else deletion = f.service.prepareDeletion(f.asset.id);
        await waitForBlocked(1);
        if (winner === "reference") deletion = f.service.prepareDeletion(f.asset.id);
        else ref = link();
        await waitForBlocked(2);
        release();
        await blocker;
        const result = await ref!;
        if (winner === "reference") {
          expect(result).toHaveProperty("value");
          expect(await deletion).toBeNull();
          await f.cleanup.run();
          expect(await f.storage.exists(f.asset.storageKey)).toBe(true);
        } else {
          expect(await deletion).toContain(f.asset.storageKey);
          expect(result).toMatchObject({ error: { code: "P2003" } });
          await f.cleanup.run();
          expect(await f.storage.exists(f.asset.storageKey)).toBe(false);
        }
      } finally {
        release();
        await blocker;
        await ref;
        await deletion;
        await f.close();
      }
    },
  );

  it("retains soft-deleted references and starts retention when a hard item cascade removes them", async () => {
    const f = await fixture();
    try {
      await f.db.mediaLink.create({
        data: { assetId: f.asset.id, ownerId: f.ownerId, itemId: f.item.id, position: 0 },
      });
      await f.db.collectibleItem.update({
        where: { id: f.item.id },
        data: { deletedAt: new Date() },
      });
      await f.cleanup.run();
      expect(await f.storage.exists(f.asset.storageKey)).toBe(true);
      expect(
        (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).orphanedAt,
      ).toBeNull();
      await f.db.collectibleItem.delete({ where: { id: f.item.id } });
      expect(
        (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).orphanedAt,
      ).toBeInstanceOf(Date);
    } finally {
      await f.close();
    }
  });

  it("keeps delayed upload publication unreadable after rows were removed and reconciles it", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let lateId: string | undefined;
    const uploads = createMediaService(f.db, {
      ...f.storage,
      read: (key) => f.storage.read(key),
      delete: (key) => f.storage.delete(key),
      exists: (key) => f.storage.exists(key),
      put: async (key, bytes) => {
        lateId = key.split("/")[1]!;
        entered();
        await held;
        await f.storage.put(key, bytes);
      },
    });
    const uploading = uploads
      .createDocumentUpload(f.ownerId, Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF"), {
        fileName: "test.pdf",
        claimedMime: "application/pdf",
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await didEnter;
      await f.db.mediaAsset.update({ where: { id: lateId! }, data: { orphanedAt: new Date(0) } });
      await f.cleanup.run();
      expect(await f.db.mediaAsset.findUnique({ where: { id: lateId! } })).toBeNull();
      release();
      expect(await uploading).toMatchObject({ error: { code: "ASSET_NOT_READY" } });
      expect(await f.storage.exists(`originals/${lateId}`)).toBe(true);
      const reads = createMediaReadService(f.db, async () => {
        throw new Error("unlinked asset should have no resource");
      });
      expect(await reads.resolveRead(f.ownerId, lateId!, "original")).toBeNull();
      await f.cleanup.run();
      expect(await f.storage.exists(`originals/${lateId}`)).toBe(false);
    } finally {
      release();
      await uploading;
      if (lateId) {
        await f.db.mediaAsset.deleteMany({ where: { id: lateId } });
        await f.db.mediaCleanupKey.deleteMany({ where: { assetId: lateId } });
      }
      await f.close();
    }
  });

  it("rotates failed cleanup assets and permanent reconciliation keys through bounded batches", async () => {
    const f = await fixture();
    const extraId = randomUUID();
    const service = createMediaCleanupService(f.db, { retentionHours: 1, batchSize: 1 });
    try {
      await f.db.mediaAsset.update({
        where: { id: f.asset.id },
        data: { orphanedAt: new Date(0) },
      });
      await f.db.mediaAsset.create({
        data: {
          id: extraId,
          ownerId: f.ownerId,
          kind: "DOCUMENT",
          status: "UPLOADING",
          storageKey: `originals/${extraId}`,
          mimeType: "application/pdf",
          byteSize: 1n,
          checksumSha256: "b".repeat(64),
          originalFileName: "orphan.pdf",
          orphanedAt: new Date(0),
        },
      });
      const first = await service.findDeletableAssets();
      const second = await service.findDeletableAssets();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(second[0]).not.toBe(first[0]);
      await service.prepareDeletion(f.asset.id);
      const keys = await service.findTombstones();
      expect(keys).toHaveLength(1);
      await service.noteReconciled(keys[0]!.storageKey);
      expect((await service.findTombstones())[0]!.storageKey).not.toBe(keys[0]!.storageKey);
    } finally {
      await f.db.mediaAsset.deleteMany({ where: { id: extraId } });
      await f.close();
    }
  });

  it("reconciles a real image processor derivative completing after asset and variant rows were deleted", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();
    await f.storage.put(f.asset.storageKey, bytes);
    await f.db.mediaAsset.update({
      where: { id: f.asset.id },
      data: {
        status: "PENDING",
        byteSize: BigInt(bytes.length),
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        orphanedAt: new Date(0),
      },
    });
    const processor = createImageProcessor(createPrismaImageRepository(f.db), {
      read: (key) => f.storage.read(key),
      delete: (key) => f.storage.delete(key),
      exists: (key) => f.storage.exists(key),
      put: async (key, value) => {
        if (key.endsWith("medium.webp")) {
          entered();
          await held;
        }
        await f.storage.put(key, value);
      },
    });
    // No outer asset lock models the server-side session already lost while storage I/O remains in flight.
    const processing = processor({ assetId: f.asset.id });
    try {
      await Promise.race([
        didEnter,
        processing.then(() => {
          throw new Error("processor finished before delayed write");
        }),
      ]);
      await f.cleanup.run();
      expect(await f.db.mediaVariant.count({ where: { assetId: f.asset.id } })).toBe(0);
      expect(await f.db.mediaAsset.findUnique({ where: { id: f.asset.id } })).toBeNull();
      release();
      await processing;
      const key = `variants/${f.asset.id}/medium.webp`;
      expect(await f.storage.exists(key)).toBe(true);
      const reads = createMediaReadService(f.db, async () => {
        throw new Error("unlinked");
      });
      expect(await reads.resolveRead(f.ownerId, f.asset.id, "medium")).toBeNull();
      await f.cleanup.run();
      expect(await f.storage.exists(key)).toBe(false);
    } finally {
      release();
      await processing;
      await f.close();
    }
  });

  it("retains media shared by a quantity split after the original item is unlinked", async () => {
    const f = await fixture();
    try {
      await f.db.collectibleItem.update({ where: { id: f.item.id }, data: { quantity: 2 } });
      const link = await f.db.mediaLink.create({
        data: {
          assetId: f.asset.id,
          ownerId: f.ownerId,
          itemId: f.item.id,
          position: 0,
          title: "Shared",
        },
      });
      const result = await createItemService(f.db, f.ownerId).splitQuantityItem(f.item.id, 1);
      await f.service.unlinkAsset(f.ownerId, "ITEM", link.id, f.item.id);
      await f.cleanup.run();
      expect(await f.storage.exists(f.asset.storageKey)).toBe(true);
      expect(
        await f.db.mediaLink.findFirst({
          where: { itemId: result.created.id, assetId: f.asset.id },
        }),
      ).toMatchObject({ title: "Shared" });
      expect(
        (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).orphanedAt,
      ).toBeNull();
    } finally {
      await f.close();
    }
  });
});
