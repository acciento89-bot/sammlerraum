import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createProfileService } from "../identity/profile-service";
import { describe, expect, it, vi } from "vitest";

import { createMediaService } from "./media-service";

const actor = "owner-1";
const pdf = Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF");
const meta = { fileName: "photo.jpg", claimedMime: "image/jpeg" };

async function image() {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .jpeg()
    .toBuffer();
}

function fixture() {
  const assets: Record<string, Record<string, unknown>> = {};
  const bytes: Record<string, Uint8Array> = {};
  const storage = {
    put: vi.fn(async (key: string, value: Uint8Array) => {
      bytes[key] = value;
    }),
    read: vi.fn(async (key: string) => {
      if (!bytes[key]) throw new Error("missing");
      return bytes[key];
    }),
    delete: vi.fn(async (key: string) => {
      delete bytes[key];
    }),
    exists: vi.fn(async (key: string) => key in bytes),
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000001" }]),
    mediaAsset: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) =>
        assets[where.id]?.ownerId === where.ownerId ? assets[where.id] : null,
      ),
    },
    collectibleItem: {
      findFirst: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })),
    },
    mediaLink: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: unknown }) => ({
        id: randomUUID(),
        ...(data as object),
      })),
    },
    documentLink: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: unknown }) => ({
        id: randomUUID(),
        ...(data as object),
      })),
    },
  };
  const db = {
    mediaAsset: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        assets[data.id as string] = { ...data };
        return assets[data.id as string];
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(assets[where.id]!, data);
          return assets[where.id];
        },
      ),
    },
    $transaction: async <T>(operation: (transaction: typeof tx) => Promise<T>) => operation(tx),
  };
  return { storage, db, tx, assets, bytes, service: createMediaService(db as never, storage) };
}

describe("media service", () => {
  it("rejects a PDF renamed to .jpg", async () => {
    const { service } = fixture();
    await expect(service.createImageUpload(actor, pdf, meta)).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
    });
  });

  it("rejects a source over the configured byte limit", async () => {
    const { storage, db } = fixture();
    const service = createMediaService(db as never, storage, { maxImageBytes: 8 });
    await expect(service.createImageUpload(actor, await image(), meta)).rejects.toMatchObject({
      code: "UPLOAD_TOO_LARGE",
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("rejects a compressed image exceeding the decoded pixel limit", async () => {
    const { storage, db } = fixture();
    const service = createMediaService(db as never, storage, { maxImagePixels: 3 });
    await expect(service.createImageUpload(actor, await image(), meta)).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("rejects a truncated image despite a valid magic header", async () => {
    const { service } = fixture();
    const source = await image();
    await expect(
      service.createImageUpload(actor, source.subarray(0, 30), meta),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  it("records the storage key before put and leaves a recoverable intent on failure", async () => {
    const { service, db, storage, assets } = fixture();
    storage.put.mockImplementationOnce(async () => {
      throw new Error("disk failed");
    });
    await expect(service.createImageUpload(actor, await image(), meta)).rejects.toThrow(
      "disk failed",
    );
    expect(db.mediaAsset.create).toHaveBeenCalledBefore(storage.put);
    expect(Object.values(assets)).toMatchObject([
      { ownerId: actor, status: "UPLOADING", kind: "IMAGE" },
    ]);
    expect(Object.values(assets)[0]?.storageKey).toMatch(/^originals\/[a-f0-9-]+$/);
  });

  it("keeps processing intent durable even when the upload status update fails", async () => {
    const { service, db, storage, assets } = fixture();
    db.mediaAsset.update.mockRejectedValueOnce(new Error("database offline"));
    await expect(service.createImageUpload(actor, await image(), meta)).rejects.toThrow(
      "database offline",
    );
    expect(storage.put).toHaveBeenCalledOnce();
    expect(Object.values(assets)[0]).toMatchObject({ status: "UPLOADING" });
  });

  it("validates and saves an image with a persistent pending processing status", async () => {
    const { service, assets, bytes } = fixture();
    const asset = await service.createImageUpload(actor, await image(), meta);
    expect(asset).toMatchObject({
      kind: "IMAGE",
      mimeType: "image/jpeg",
      status: "PENDING",
      width: 2,
      height: 2,
    });
    expect(asset).not.toHaveProperty("storageKey");
    expect(Object.values(assets)[0]).toMatchObject({ status: "PENDING", byteSize: 270n });
    expect(Object.values(bytes)).toHaveLength(1);
  });

  it("stores a PDF as a private document with no image decoding", async () => {
    const { service } = fixture();
    await expect(
      service.createDocumentUpload(actor, pdf, {
        fileName: "receipt.pdf",
        claimedMime: "application/pdf",
      }),
    ).resolves.toMatchObject({
      kind: "DOCUMENT",
      mimeType: "application/pdf",
      status: "READY",
      width: null,
    });
  });

  it("keeps image-backed documents pending sanitized processing", async () => {
    const { service } = fixture();
    await expect(service.createDocumentUpload(actor, await image(), meta)).resolves.toMatchObject({
      kind: "DOCUMENT",
      status: "PENDING",
      mimeType: "image/jpeg",
    });
  });

  it("rejects a claimed MIME that disagrees with detected content", async () => {
    const { service } = fixture();
    await expect(
      service.createDocumentUpload(actor, pdf, {
        fileName: "receipt.pdf",
        claimedMime: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_DOCUMENT" });
  });

  it("retains a tracked upload if a link transaction fails", async () => {
    const { service, tx, assets, bytes } = fixture();
    const asset = await service.createImageUpload(actor, await image(), meta);
    tx.mediaLink.create.mockRejectedValueOnce(new Error("database link failed"));
    await expect(
      service.linkAsset(actor, {
        target: "ITEM",
        itemId: randomUUID(),
        assetId: asset.id,
        purpose: "GALLERY",
      }),
    ).rejects.toThrow("database link failed");
    expect(assets[asset.id]).toMatchObject({ status: "PENDING" });
    expect(Object.values(bytes)).toHaveLength(1);
  });

  it("does not link to a foreign or deleted item", async () => {
    const { service, tx, assets } = fixture();
    const assetId = randomUUID();
    assets[assetId] = { id: assetId, ownerId: actor, kind: "IMAGE", status: "READY" };
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.linkAsset(actor, {
        target: "ITEM",
        itemId: randomUUID(),
        assetId,
        purpose: "GALLERY",
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    expect(tx.mediaLink.create).not.toHaveBeenCalled();
  });

  it("persists a private categorized document link without exposing storage keys", async () => {
    const { service, tx, assets } = fixture();
    const assetId = randomUUID();
    assets[assetId] = {
      id: assetId,
      ownerId: actor,
      kind: "DOCUMENT",
      status: "READY",
      storageKey: "originals/secret",
    };
    const result = await service.linkAsset(actor, {
      target: "ITEM_DOCUMENT",
      itemId: randomUUID(),
      assetId,
      category: "PURCHASE_RECEIPT",
    });
    expect(result).toMatchObject({
      assetId,
      category: "PURCHASE_RECEIPT",
      visibility: "PRIVATE",
      position: 0,
    });
    expect(result).not.toHaveProperty("storageKey");
    expect(tx.documentLink.create).toHaveBeenCalledOnce();
  });

  it("rejects a document as a gallery image and an unready asset", async () => {
    const { service, assets } = fixture();
    const assetId = randomUUID();
    assets[assetId] = { id: assetId, ownerId: actor, kind: "DOCUMENT", status: "READY" };
    await expect(
      service.linkAsset(actor, {
        target: "ITEM",
        itemId: randomUUID(),
        assetId,
        purpose: "GALLERY",
      }),
    ).rejects.toMatchObject({ code: "ASSET_KIND_MISMATCH" });
    assets[assetId]!.status = "UPLOADING";
    await expect(
      service.linkAsset(actor, {
        target: "ITEM_DOCUMENT",
        itemId: randomUUID(),
        assetId,
        category: "INVOICE",
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
  });

  it("rejects embedded NUL in a link title before database persistence", async () => {
    const { service, tx, assets } = fixture();
    const assetId = randomUUID();
    assets[assetId] = { id: assetId, ownerId: actor, kind: "IMAGE", status: "READY" };
    await expect(
      service.linkAsset(actor, {
        target: "ITEM",
        itemId: randomUUID(),
        assetId,
        purpose: "GALLERY",
        title: "bad\u0000title",
      }),
    ).rejects.toThrow();
    expect(tx.mediaLink.create).not.toHaveBeenCalled();
  });

  it("hides foreign assets and rejects unsupported future targets before linking", async () => {
    const { service, tx, assets } = fixture();
    const assetId = randomUUID();
    assets[assetId] = { id: assetId, ownerId: "foreign", kind: "IMAGE", status: "READY" };
    await expect(
      service.linkAsset(actor, {
        assetId,
        target: "ITEM",
        itemId: randomUUID(),
        purpose: "GALLERY",
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    await expect(
      service.linkAsset(actor, {
        assetId,
        target: "CATALOG",
        itemId: randomUUID(),
        purpose: "GALLERY",
      } as never),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TARGET" });
    expect(tx.mediaLink.create).not.toHaveBeenCalled();
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const prisma = runIntegration ? createPrismaClient(process.env.DATABASE_URL!) : undefined;

describe.runIf(runIntegration)("media PostgreSQL integration", () => {
  it("enforces owned item and avatar references on real rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "sammlerraum-media-"));
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await prisma!.$connect();
    try {
      for (const id of [ownerId, otherId]) {
        await prisma!.user.create({
          data: { id, name: "Owner", email: `${id}@example.test`, emailVerified: true },
        });
      }
      const collection = await prisma!.collection.create({ data: { ownerId, name: "Owned" } });
      const item = await prisma!.collectibleItem.create({
        data: { ownerId, collectionId: collection.id, title: "Stamp" },
      });
      const service = createMediaService(prisma!, new LocalPersistentStorage(root));
      const asset = await service.createImageUpload(ownerId, await image(), meta);
      await expect(
        service.linkAsset(otherId, {
          target: "ITEM",
          itemId: item.id,
          assetId: asset.id,
          purpose: "GALLERY",
        }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      await expect(
        service.linkAsset(ownerId, {
          target: "ITEM",
          itemId: item.id,
          assetId: asset.id,
          purpose: "GALLERY",
        }),
      ).resolves.toMatchObject({ assetId: asset.id, itemId: item.id });
      await expect(
        prisma!.mediaLink.create({
          data: { ownerId: otherId, itemId: item.id, assetId: asset.id, position: 10 },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      await expect(prisma!.user.delete({ where: { id: ownerId } })).rejects.toMatchObject({
        code: "P2003",
      });
      await prisma!.mediaAsset.update({ where: { id: asset.id }, data: { status: "READY" } });
      await expect(
        createProfileService(prisma!).upsertOwnProfile(otherId, {
          handle: `other-${otherId}`,
          displayName: "Other",
          bio: null,
          avatarAssetId: asset.id,
        }),
      ).rejects.toMatchObject({ code: "AVATAR_NOT_FOUND" });
      await expect(
        createProfileService(prisma!).upsertOwnProfile(ownerId, {
          handle: `owner-${ownerId}`,
          displayName: "Owner",
          bio: null,
          avatarAssetId: asset.id,
        }),
      ).resolves.toMatchObject({ avatarAssetId: asset.id });
      await expect(
        prisma!.userProfile.create({
          data: {
            userId: otherId,
            handle: `foreign-${otherId}`,
            displayName: "Other",
            avatarAssetId: asset.id,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    } finally {
      await prisma!.userProfile.deleteMany({ where: { userId: { in: [ownerId, otherId] } } });
      await prisma!.mediaLink.deleteMany({ where: { ownerId } });
      await prisma!.documentLink.deleteMany({ where: { ownerId } });
      await prisma!.mediaAsset.deleteMany({ where: { ownerId } });
      await prisma!.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
      await prisma!.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  });
});
