import type { MediaDatabase } from "./media-service";

export class MediaCleanupError extends Error {
  readonly code = "LINK_NOT_FOUND";
  constructor() {
    super("Media link not found");
  }
}

export function createMediaCleanupService(
  database: MediaDatabase,
  options: { retentionHours: number; batchSize?: number },
) {
  const batchSize = options.batchSize ?? 100;
  if (
    !Number.isSafeInteger(options.retentionHours) ||
    options.retentionHours < 1 ||
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 1000
  )
    throw new RangeError("Invalid media cleanup policy");
  const cutoff = () => new Date(Date.now() - options.retentionHours * 3_600_000);
  return {
    async unlinkAsset(
      actorUserId: string,
      target: "ITEM" | "ITEM_DOCUMENT" | "AVATAR",
      linkId: string,
      itemId?: string,
    ) {
      if (target !== "ITEM" && target !== "ITEM_DOCUMENT" && target !== "AVATAR")
        throw new MediaCleanupError();
      await database.$transaction(async (tx) => {
        if (target === "AVATAR") {
          if (linkId !== actorUserId) throw new MediaCleanupError();
          const result = await tx.userProfile.updateMany({
            where: { userId: actorUserId, avatarAssetId: { not: null } },
            data: { avatarAssetId: null },
          });
          if (!result.count) throw new MediaCleanupError();
          return;
        }
        // Preserve item -> asset ordering shared with split and link. Foreign IDs are hidden.
        if (!itemId) throw new MediaCleanupError();
        const item = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT i.id FROM "CollectibleItem" i JOIN "Collection" c ON c.id = i."collectionId"
          WHERE i.id = ${itemId}::uuid AND i."ownerId" = ${actorUserId}
          AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL FOR UPDATE OF i`;
        if (!item[0]) throw new MediaCleanupError();
        const where = { id: linkId, ownerId: actorUserId, itemId };
        const result =
          target === "ITEM"
            ? await tx.mediaLink.deleteMany({ where })
            : await tx.documentLink.deleteMany({ where });
        if (!result.count) throw new MediaCleanupError();
      });
    },
    async findDeletableAssets() {
      const assets = await database.mediaAsset.findMany({
        where: {
          orphanedAt: { lte: cutoff() },
          mediaLinks: { none: {} },
          documentLinks: { none: {} },
          avatarProfiles: { none: {} },
        },
        orderBy: [
          { cleanupAttemptAt: { sort: "asc", nulls: "first" } },
          { orphanedAt: "asc" },
          { id: "asc" },
        ],
        take: batchSize,
        select: { id: true },
      });
      await database.mediaAsset.updateMany({
        where: { id: { in: assets.map((asset) => asset.id) } },
        data: { cleanupAttemptAt: new Date() },
      });
      return assets.map((asset) => asset.id);
    },
    async prepareDeletion(assetId: string): Promise<string[] | null> {
      return database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id = ${assetId}::uuid FOR UPDATE`;
        const asset = await tx.mediaAsset.findFirst({
          where: {
            id: assetId,
            orphanedAt: { lte: cutoff() },
            mediaLinks: { none: {} },
            documentLinks: { none: {} },
            avatarProfiles: { none: {} },
          },
          include: { variants: true },
        });
        if (!asset) return null;
        await tx.mediaAsset.update({
          where: { id: assetId },
          data: {
            cleanupStartedAt: asset.cleanupStartedAt ?? new Date(),
            processingToken: null,
            processingLeaseUntil: null,
          },
        });
        // All deterministic generated keys are tracked, even if a reservation was in flight.
        const keys = [
          ...new Set([
            asset.storageKey,
            ...asset.variants.map((v) => v.storageKey),
            ...["thumbnail", "medium", "large"].map((name) => `variants/${assetId}/${name}.webp`),
          ]),
        ];
        await tx.mediaCleanupKey.createMany({
          data: keys.map((storageKey) => ({ assetId, storageKey })),
          skipDuplicates: true,
        });
        return keys;
      });
    },
    async finishDeletion(assetId: string) {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id = ${assetId}::uuid FOR UPDATE`;
        const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
        if (!asset?.cleanupStartedAt) return;
        await tx.mediaVariant.deleteMany({ where: { assetId } });
        await tx.mediaAsset.delete({ where: { id: assetId } });
      });
    },
    async findTombstones() {
      return database.mediaCleanupKey.findMany({
        take: batchSize,
        orderBy: [{ lastCheckedAt: "asc" }, { storageKey: "asc" }],
      });
    },
    async noteReconciled(storageKey: string) {
      // Rotate failed keys too so a broken path cannot starve later tombstones.
      await database.mediaCleanupKey.update({
        where: { storageKey },
        data: { lastCheckedAt: new Date() },
      });
    },
  };
}
