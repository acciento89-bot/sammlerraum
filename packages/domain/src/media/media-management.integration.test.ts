import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { describe, expect, it } from "vitest";
import { createMediaService } from "./media-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const url = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(url).pathname.endsWith("_test")) throw new Error("Requires test database");
const db = enabled ? createPrismaClient(url) : undefined;
describe.runIf(enabled)("owner media management PostgreSQL", () => {
  it("orders a complete gallery atomically, hides foreign links and sanitizes list DTOs", async () => {
    const ownerId = randomUUID();
    const service = createMediaService(db!, {} as never);
    try {
      await db!.user.create({
        data: { id: ownerId, name: "Media", email: `${ownerId}@example.test` },
      });
      const collection = await db!.collection.create({ data: { ownerId, name: "Media" } });
      const item = await db!.collectibleItem.create({
        data: { ownerId, collectionId: collection.id, title: "Media" },
      });
      const links = [];
      for (let position = 0; position < 3; position++) {
        const asset = await db!.mediaAsset.create({
          data: {
            ownerId,
            kind: "IMAGE",
            status: "PENDING",
            storageKey: `originals/${randomUUID()}`,
            mimeType: "image/png",
            byteSize: 3n,
            checksumSha256: "a".repeat(64),
            originalFileName: `${position}.png`,
          },
        });
        links.push(
          await db!.mediaLink.create({
            data: { ownerId, itemId: item.id, assetId: asset.id, position },
          }),
        );
      }
      const retained = await db!.mediaAsset.create({
        data: {
          ownerId,
          kind: "IMAGE",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 3n,
          checksumSha256: "a".repeat(64),
          originalFileName: "retained.png",
          cleanupStartedAt: new Date(),
        },
      });
      await expect(
        service.linkAsset(ownerId, {
          target: "ITEM",
          itemId: item.id,
          assetId: retained.id,
          purpose: "GALLERY",
        }),
      ).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
      const order = [links[2]!.id, links[0]!.id, links[1]!.id];
      await service.reorderGallery(ownerId, item.id, order);
      const listed = await service.listItemMedia(ownerId, item.id);
      expect(listed.images.map((x) => x.id)).toEqual(order);
      expect(JSON.stringify(listed)).not.toMatch(/storageKey|originals\/|ownerId|checksum/);
      await expect(
        service.reorderGallery(ownerId, item.id, [order[0]!, order[0]!, order[1]!]),
      ).rejects.toThrow();
      await expect(
        service.reorderGallery(ownerId, item.id, [...order.slice(0, 2), randomUUID()]),
      ).rejects.toThrow();
      expect((await service.listItemMedia(ownerId, item.id)).images.map((x) => x.id)).toEqual(
        order,
      );
      await expect(service.listItemMedia("foreign", item.id)).rejects.toThrow("ITEM_NOT_FOUND");
      await expect(service.reorderGallery("foreign", item.id, order)).rejects.toThrow(
        "ITEM_NOT_FOUND",
      );
      const document = await db!.mediaAsset.create({
        data: {
          ownerId,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 3n,
          checksumSha256: "a".repeat(64),
          originalFileName: "receipt.pdf",
        },
      });
      const link = await service.linkAsset(ownerId, {
        target: "ITEM_DOCUMENT",
        itemId: item.id,
        assetId: document.id,
        category: "PURCHASE_RECEIPT",
      });
      expect((await service.listItemMedia(ownerId, item.id)).documents[0]?.visibility).toBe(
        "PRIVATE",
      );
      await service.updateDocument(ownerId, item.id, link.id, {
        category: "INVOICE",
        visibility: "PUBLIC",
      });
      expect((await service.listItemMedia(ownerId, item.id)).documents[0]).toMatchObject({
        category: "INVOICE",
        visibility: "PUBLIC",
      });
      await expect(
        service.updateDocument("foreign", item.id, link.id, {
          category: "INVOICE",
          visibility: "PRIVATE",
        }),
      ).rejects.toThrow("ITEM_NOT_FOUND");
    } finally {
      await db!.mediaLink.deleteMany({ where: { ownerId } });
      await db!.documentLink.deleteMany({ where: { ownerId } });
      await db!.mediaAsset.deleteMany({ where: { ownerId } });
      await db!.user.deleteMany({ where: { id: ownerId } });
      await db!.$disconnect();
    }
  });
});
