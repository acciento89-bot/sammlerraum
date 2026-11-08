import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";

const enabled = process.env.RUN_AUTH_E2E === "1" && process.env.RUN_PRODUCTION_E2E === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Media browser fixtures require a _test database");
}
const prisma = enabled ? createPrismaClient(databaseUrl) : undefined;
const storage = enabled ? new LocalPersistentStorage(process.env.UPLOADS_DIR!) : undefined;

test.describe("production media read headers and revocation", () => {
  test.skip(!enabled, "requires migrated test PostgreSQL and a production Next server");

  test("public derivative revalidates after revocation while private receipts never disclose bytes", async ({
    request,
  }) => {
    const ownerId = randomUUID();
    const originalKey = `originals/${randomUUID()}`;
    const variantKey = `variants/${randomUUID()}`;
    const thumbnailKey = `variants/${randomUUID()}`;
    const largeKey = `variants/${randomUUID()}`;
    const pdfKey = `originals/${randomUUID()}`;
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    await prisma!.$connect();
    try {
      await prisma!.user.create({
        data: { id: ownerId, name: "Media", email: `${ownerId}@example.test`, emailVerified: true },
      });
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Public", visibility: "PUBLIC" },
      });
      const item = await prisma!.collectibleItem.create({
        data: { ownerId, collectionId: collection.id, title: "Picture", visibility: "PUBLIC" },
      });
      const image = await prisma!.mediaAsset.create({
        data: {
          ownerId,
          kind: "IMAGE",
          status: "READY",
          storageKey: originalKey,
          mimeType: "image/jpeg",
          byteSize: 3n,
          checksumSha256: hash,
          originalFileName: "picture.jpg",
          width: 2,
          height: 2,
        },
      });
      await prisma!.mediaVariant.createMany({
        data: (
          [
            ["THUMBNAIL", thumbnailKey],
            ["MEDIUM", variantKey],
            ["LARGE", largeKey],
          ] as const
        ).map(([name, storageKey]) => ({
          assetId: image.id,
          name,
          storageKey,
          mimeType: "image/webp",
          byteSize: 3n,
          checksumSha256: hash,
          width: 2,
          height: 2,
        })),
      });
      await prisma!.mediaLink.create({
        data: { assetId: image.id, ownerId, itemId: item.id, position: 0 },
      });
      const pdf = await prisma!.mediaAsset.create({
        data: {
          ownerId,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: pdfKey,
          mimeType: "application/pdf",
          byteSize: 3n,
          checksumSha256: hash,
          originalFileName: 'evil"; filename=private.pdf',
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
      await Promise.all([
        storage!.put(originalKey, bytes),
        storage!.put(variantKey, bytes),
        storage!.put(thumbnailKey, bytes),
        storage!.put(largeKey, bytes),
        storage!.put(pdfKey, bytes),
      ]);
      const imageUrl = `/api/v1/media/${image.id}/medium`;
      const originalUrl = `/api/v1/media/${image.id}/original`;
      const pdfUrl = `/api/v1/media/${pdf.id}/original`;
      const publicResponse = await request.get(imageUrl);
      expect(publicResponse.status()).toBe(200);
      expect(publicResponse.headers()["content-type"]).toContain("image/webp");
      expect(publicResponse.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
      expect(publicResponse.headers().etag).toBe(`"${hash}"`);
      expect(await publicResponse.body()).toEqual(Buffer.from(bytes));
      expect((await request.get(originalUrl)).status()).toBe(404);
      const receipt = await request.get(pdfUrl);
      expect(receipt.status()).toBe(404);
      expect(receipt.headers()["cache-control"]).toContain("no-store");
      await prisma!.documentLink.update({
        where: { id: document.id },
        data: { visibility: "PUBLIC" },
      });
      const publicPdf = await request.get(pdfUrl);
      expect(publicPdf.status()).toBe(200);
      expect(publicPdf.headers()["content-disposition"]).toBe(
        'attachment; filename="document.pdf"',
      );
      await prisma!.collection.update({
        where: { id: collection.id },
        data: { visibility: "PRIVATE" },
      });
      const revoked = await request.get(imageUrl, { headers: { "if-none-match": `"${hash}"` } });
      expect(revoked.status()).toBe(404);
      expect(revoked.headers()["cache-control"]).toContain("no-store");
      expect((await request.get(pdfUrl)).status()).toBe(404);
    } finally {
      await prisma!.mediaLink.deleteMany({ where: { ownerId } });
      await prisma!.documentLink.deleteMany({ where: { ownerId } });
      await prisma!.mediaVariant.deleteMany({ where: { asset: { ownerId } } });
      await prisma!.mediaAsset.deleteMany({ where: { ownerId } });
      await prisma!.collectibleItem.deleteMany({ where: { ownerId } });
      await prisma!.collection.deleteMany({ where: { ownerId } });
      await prisma!.user.deleteMany({ where: { id: ownerId } });
      await prisma!.$disconnect();
      await Promise.all(
        [originalKey, variantKey, thumbnailKey, largeKey, pdfKey].map((key) =>
          storage!.delete(key),
        ),
      );
    }
  });
});
