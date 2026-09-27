import { createHash, randomUUID } from "node:crypto";

import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { describe, expect, it } from "vitest";

import { createPrismaImageRepository } from "./image-repository";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("durable image claims", () => {
  it("recovers expired claims, rejects stale tokens, and tracks a key before bytes", async () => {
    const db = createTestDatabaseClient();
    const ownerId = randomUUID();
    const id = randomUUID();
    const checksum = createHash("sha256").update("source").digest("hex");
    try {
      await db.user.create({
        data: {
          id: ownerId,
          name: "Worker",
          email: `${ownerId}@example.test`,
          emailVerified: false,
        },
      });
      await db.mediaAsset.create({
        data: {
          id,
          ownerId,
          kind: "DOCUMENT",
          status: "PENDING",
          mimeType: "image/jpeg",
          storageKey: `originals/${id}`,
          byteSize: 6n,
          checksumSha256: checksum,
          originalFileName: "source.jpg",
        },
      });
      const repo = createPrismaImageRepository(db);
      const first = await repo.claim(id);
      expect(first).toMatchObject({ id, kind: "DOCUMENT" });
      expect(await repo.claim(id)).toBeNull();
      await db.mediaAsset.update({
        where: { id },
        data: { processingLeaseUntil: new Date(0) },
      });
      const second = await repo.claim(id);
      expect(second?.token).not.toBe(first?.token);
      expect(await repo.renew(first!)).toBe(false);
      expect(await repo.reserveVariant(first!, "THUMBNAIL", `variants/${id}/thumbnail.webp`)).toBe(
        false,
      );
      expect(await repo.reserveVariant(second!, "THUMBNAIL", `variants/${id}/thumbnail.webp`)).toBe(
        true,
      );
      expect(
        await db.mediaVariant.findUnique({
          where: { assetId_name: { assetId: id, name: "THUMBNAIL" } },
        }),
      ).toMatchObject({ storageKey: `variants/${id}/thumbnail.webp`, byteSize: 0n });
      await repo.fail(first!, "SOURCE_INVALID", false);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe("PROCESSING");
      await repo.fail(second!, "STORAGE_ERROR", true);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
      const third = await repo.claim(id);
      expect(third).not.toBeNull();
      expect(await repo.ready(third!)).rejects.toThrow("Incomplete image variants");
      for (const name of ["THUMBNAIL", "MEDIUM", "LARGE"] as const) {
        await repo.reserveVariant(third!, name, `variants/${id}/${name.toLowerCase()}.webp`);
        expect(
          await repo.finishVariant(third!, name, {
            width: 1,
            height: 1,
            size: 12n,
            checksum,
          }),
        ).toBe(true);
      }
      expect(await repo.ready(third!)).toBe(true);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe("READY");
      expect(await repo.claim(id)).toBeNull();
      await db.mediaAsset.update({
        where: { id },
        data: {
          status: "PROCESSING",
          processingAttempts: 5,
          processingToken: randomUUID(),
          processingLeaseUntil: new Date(0),
        },
      });
      expect(await repo.claim(id)).toBeNull();
      expect(await db.mediaAsset.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: "FAILED",
        processingErrorCode: "PROCESSING_ERROR",
      });
    } finally {
      await db.mediaVariant.deleteMany({ where: { assetId: id } });
      await db.mediaAsset.deleteMany({ where: { id } });
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  });

  it("paginates dispatch intents and excludes PDFs, active claims, and failed assets", async () => {
    const db = createTestDatabaseClient();
    const ownerId = randomUUID();
    const ids = Array.from({ length: 35 }, () => randomUUID());
    try {
      await db.user.create({
        data: {
          id: ownerId,
          name: "Dispatcher",
          email: `${ownerId}@example.test`,
          emailVerified: false,
        },
      });
      for (const [i, id] of ids.entries()) {
        await db.mediaAsset.create({
          data: {
            id,
            ownerId,
            kind: i % 2 ? "DOCUMENT" : "IMAGE",
            status: "PENDING",
            mimeType: i === 34 ? "application/pdf" : "image/jpeg",
            storageKey: `originals/${id}`,
            byteSize: 6n,
            checksumSha256: createHash("sha256").update("source").digest("hex"),
            originalFileName: "source.jpg",
          },
        });
      }
      const repo = createPrismaImageRepository(db);
      const first = await repo.dispatchCandidates(32);
      expect(first).toHaveLength(32);
      for (const id of first) await repo.noteDispatched(id);
      const rest = await repo.dispatchCandidates(32);
      expect(rest).toHaveLength(2);
      expect(rest).not.toContain(ids[34]);
      expect(rest.some((id) => first.includes(id))).toBe(false);
    } finally {
      await db.mediaAsset.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  });
});
