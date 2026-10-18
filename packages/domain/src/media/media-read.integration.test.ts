import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { describe, expect, it } from "vitest";

import { createResourceQuery } from "../api/resource-query";
import { createMediaReadService } from "./media-read";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const prisma = enabled ? createPrismaClient(process.env.DATABASE_URL!) : undefined;
const sha = "a".repeat(64);

describe.runIf(enabled)("media read PostgreSQL authorization", () => {
  it("resolves actual ancestor and document links, then revokes stale public URLs", async () => {
    const ownerId = randomUUID();
    const visitorId = randomUUID();
    await prisma!.$connect();
    try {
      await prisma!.user.createMany({
        data: [ownerId, visitorId].map((id) => ({
          id,
          name: "Media fixture",
          email: `${id}@example.test`,
          emailVerified: true,
        })),
      });
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Public", visibility: "PUBLIC" },
      });
      const root = await prisma!.collectionNode.create({
        data: { collectionId: collection.id, name: "Root", visibility: "PUBLIC" },
      });
      const child = await prisma!.collectionNode.create({
        data: {
          collectionId: collection.id,
          parentId: root.id,
          name: "Child",
          visibility: "PUBLIC",
        },
      });
      const item = await prisma!.collectibleItem.create({
        data: {
          collectionId: collection.id,
          ownerId,
          nodeId: child.id,
          title: "Picture",
          visibility: "PUBLIC",
        },
      });
      const image = await prisma!.mediaAsset.create({
        data: {
          ownerId,
          kind: "IMAGE",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "image/jpeg",
          byteSize: 42n,
          checksumSha256: sha,
          originalFileName: "photo.jpg",
          width: 20,
          height: 10,
        },
      });
      await prisma!.mediaVariant.createMany({
        data: (["THUMBNAIL", "MEDIUM", "LARGE"] as const).map((name) => ({
          assetId: image.id,
          name,
          storageKey: `variants/${randomUUID()}`,
          mimeType: "image/webp",
          byteSize: 15n,
          checksumSha256: sha,
          width: 20,
          height: 10,
        })),
      });
      await prisma!.mediaLink.create({
        data: { assetId: image.id, ownerId, itemId: item.id, purpose: "GALLERY", position: 0 },
      });
      const pdf = await prisma!.mediaAsset.create({
        data: {
          ownerId,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 42n,
          checksumSha256: sha,
          originalFileName: "../../unsafe.pdf",
        },
      });
      const document = await prisma!.documentLink.create({
        data: {
          assetId: pdf.id,
          ownerId,
          itemId: item.id,
          position: 0,
          category: "PURCHASE_RECEIPT",
        },
      });
      const service = createMediaReadService(prisma!, createResourceQuery(prisma!).loadItem);
      expect(await service.resolveRead(null, image.id, "medium")).toMatchObject({
        public: true,
        mimeType: "image/webp",
      });
      expect(await service.resolveRead(visitorId, image.id, "original")).toBeNull();
      expect(await service.resolveRead(visitorId, pdf.id, "original")).toBeNull();
      await prisma!.documentLink.update({
        where: { id: document.id },
        data: { visibility: "PUBLIC" },
      });
      expect(await service.resolveRead(null, pdf.id, "original")).toMatchObject({
        public: true,
        download: true,
      });
      await prisma!.collectionNode.update({
        where: { id: root.id },
        data: { visibility: "PRIVATE" },
      });
      expect(await service.resolveRead(null, image.id, "medium")).toBeNull();
      expect(await service.resolveRead(null, pdf.id, "original")).toBeNull();
      await prisma!.collectionNode.update({
        where: { id: root.id },
        data: { visibility: "PUBLIC" },
      });
      await prisma!.collectibleItem.update({
        where: { id: item.id },
        data: { archivedAt: new Date() },
      });
      expect(await service.resolveRead(null, image.id, "medium")).toBeNull();
      await prisma!.collectibleItem.update({
        where: { id: item.id },
        data: { archivedAt: null, disposedAt: new Date() },
      });
      expect(await service.resolveRead(null, image.id, "medium")).toBeNull();
      await prisma!.collectibleItem.update({
        where: { id: item.id },
        data: { disposedAt: null, deletedAt: new Date() },
      });
      expect(await service.resolveRead(null, image.id, "medium")).toBeNull();
      expect(await service.resolveRead(ownerId, image.id, "original")).toBeNull();
      await prisma!.userProfile.create({
        data: {
          userId: ownerId,
          handle: `media-${ownerId}`,
          displayName: "Media",
          avatarAssetId: image.id,
        },
      });
      expect(await service.resolveRead(null, image.id, "medium")).toMatchObject({ public: true });
      await prisma!.userProfile.delete({ where: { userId: ownerId } });
      expect(await service.resolveRead(null, image.id, "medium")).toBeNull();
    } finally {
      await prisma!.userProfile.deleteMany({ where: { userId: ownerId } });
      await prisma!.mediaLink.deleteMany({ where: { ownerId } });
      await prisma!.documentLink.deleteMany({ where: { ownerId } });
      await prisma!.mediaVariant.deleteMany({ where: { asset: { ownerId } } });
      await prisma!.mediaAsset.deleteMany({ where: { ownerId } });
      await prisma!.collectibleItem.deleteMany({ where: { ownerId } });
      await prisma!.collectionNode.deleteMany({
        where: { collection: { ownerId }, parentId: { not: null } },
      });
      await prisma!.collectionNode.deleteMany({ where: { collection: { ownerId } } });
      await prisma!.collection.deleteMany({ where: { ownerId } });
      await prisma!.user.deleteMany({ where: { id: { in: [ownerId, visitorId] } } });
      await prisma!.$disconnect();
    }
  });
});
