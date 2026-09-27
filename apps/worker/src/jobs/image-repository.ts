import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { ImageDispatchRepository } from "./image-dispatcher";
import {
  IMAGE_VARIANTS,
  type ImageClaim,
  type ImageErrorCode,
  type ImageRepository,
  type VariantData,
} from "./process-image";

const leaseMs = 10 * 60_000;
const redispatchMs = 30_000;
const maxAttempts = 5;
const supported = ["image/jpeg", "image/png", "image/webp"];

export function createPrismaImageRepository(
  database: PrismaClient,
): ImageRepository & ImageDispatchRepository {
  const lease = () => new Date(Date.now() + leaseMs);
  const active = (claim: ImageClaim) => ({
    id: claim.id,
    status: "PROCESSING" as const,
    processingToken: claim.token,
    processingLeaseUntil: { gt: new Date() },
  });
  return {
    async dispatchCandidates(limit) {
      const now = new Date();
      const rows = await database.mediaAsset.findMany({
        where: {
          mimeType: { in: supported },
          OR: [{ status: "PENDING" }, { status: "PROCESSING", processingLeaseUntil: { lt: now } }],
          AND: [
            {
              OR: [
                { lastDispatchedAt: null },
                { lastDispatchedAt: { lt: new Date(now.getTime() - redispatchMs) } },
              ],
            },
          ],
        },
        orderBy: [
          { lastDispatchedAt: { sort: "asc", nulls: "first" } },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        take: Math.min(Math.max(limit, 1), 32),
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
    async noteDispatched(assetId) {
      await database.mediaAsset.updateMany({
        where: {
          id: assetId,
          OR: [
            { status: "PENDING" },
            { status: "PROCESSING", processingLeaseUntil: { lt: new Date() } },
          ],
        },
        data: { lastDispatchedAt: new Date() },
      });
    },
    async claim(assetId) {
      const now = new Date();
      const token = randomUUID();
      const where = {
        id: assetId,
        mimeType: { in: supported },
        OR: [
          { status: "PENDING" as const },
          { status: "PROCESSING" as const, processingLeaseUntil: { lt: now } },
        ],
      };
      const updated = await database.mediaAsset.updateMany({
        where: { ...where, processingAttempts: { lt: maxAttempts } },
        data: {
          status: "PROCESSING",
          processingToken: token,
          processingLeaseUntil: lease(),
          processingAttempts: { increment: 1 },
          processingErrorCode: null,
        },
      });
      if (!updated.count) {
        await database.mediaAsset.updateMany({
          where: { ...where, processingAttempts: { gte: maxAttempts } },
          data: {
            status: "FAILED",
            processingErrorCode: "PROCESSING_ERROR",
            processingToken: null,
            processingLeaseUntil: null,
          },
        });
        return null;
      }
      const asset = await database.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
      if (asset.processingToken !== token) return null;
      return {
        id: asset.id,
        token,
        kind: asset.kind,
        mimeType: asset.mimeType,
        storageKey: asset.storageKey,
        byteSize: asset.byteSize,
        checksumSha256: asset.checksumSha256,
      };
    },
    async renew(claim) {
      return (
        (
          await database.mediaAsset.updateMany({
            where: active(claim),
            data: { processingLeaseUntil: lease() },
          })
        ).count === 1
      );
    },
    async reserveVariant(claim, name, key) {
      return database.$transaction(async (tx) => {
        const guard = await tx.mediaAsset.updateMany({
          where: active(claim),
          data: { processingLeaseUntil: lease() },
        });
        if (!guard.count) return false;
        const variant = await tx.mediaVariant.upsert({
          where: { assetId_name: { assetId: claim.id, name } },
          create: {
            assetId: claim.id,
            name,
            storageKey: key,
            mimeType: "image/webp",
            byteSize: 0n,
            checksumSha256: "0".repeat(64),
            width: 0,
            height: 0,
          },
          update: {},
        });
        if (variant.storageKey !== key) throw new Error("Unexpected tracked variant key");
        return true;
      });
    },
    async finishVariant(claim, name, data: VariantData) {
      return database.$transaction(async (tx) => {
        const guard = await tx.mediaAsset.updateMany({
          where: active(claim),
          data: { processingLeaseUntil: lease() },
        });
        if (!guard.count) return false;
        const updated = await tx.mediaVariant.updateMany({
          where: {
            assetId: claim.id,
            name,
            storageKey: `variants/${claim.id}/${name.toLowerCase()}.webp`,
          },
          data: {
            width: data.width,
            height: data.height,
            byteSize: data.size,
            checksumSha256: data.checksum,
          },
        });
        return updated.count === 1;
      });
    },
    async ready(claim) {
      return database.$transaction(async (tx) => {
        const guard = await tx.mediaAsset.updateMany({
          where: active(claim),
          data: { processingLeaseUntil: lease() },
        });
        if (!guard.count) return false;
        const variants = await tx.mediaVariant.findMany({ where: { assetId: claim.id } });
        if (
          variants.length !== IMAGE_VARIANTS.length ||
          !IMAGE_VARIANTS.every(({ name }) =>
            variants.some(
              (variant) =>
                variant.name === name &&
                variant.storageKey === `variants/${claim.id}/${name.toLowerCase()}.webp` &&
                variant.mimeType === "image/webp" &&
                variant.byteSize > 0n &&
                variant.width > 0 &&
                variant.height > 0 &&
                variant.checksumSha256 !== "0".repeat(64),
            ),
          )
        ) {
          throw new Error("Incomplete image variants");
        }
        const updated = await tx.mediaAsset.updateMany({
          where: active(claim),
          data: {
            status: "READY",
            processingToken: null,
            processingLeaseUntil: null,
            processingErrorCode: null,
          },
        });
        return updated.count === 1;
      });
    },
    async fail(claim, code: ImageErrorCode, retry: boolean) {
      const asset = await database.mediaAsset.findUnique({
        where: { id: claim.id },
        select: { processingAttempts: true },
      });
      await database.mediaAsset.updateMany({
        where: { id: claim.id, status: "PROCESSING", processingToken: claim.token },
        data: {
          status: retry && asset && asset.processingAttempts < maxAttempts ? "PENDING" : "FAILED",
          processingToken: null,
          processingLeaseUntil: null,
          processingErrorCode: code,
          lastDispatchedAt: null,
        },
      });
    },
  };
}
