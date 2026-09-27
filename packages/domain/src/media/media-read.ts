import { MediaAssetSchema } from "@sammlerraum/contracts/media";

import { authorize } from "../authz/policy";
import {
  createTrustedActorFacts,
  createTrustedResourceFacts,
  type ResourceFacts,
} from "../authz/types";
import { ResourceQueryError } from "../api/resource-query";

type QueryDatabase = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
type ItemVisibility = {
  item: { archivedAt: string | null; disposedAt: string | null };
  facts: ResourceFacts;
};
type AssetRow = {
  id: string;
  ownerId: string;
  kind: "IMAGE" | "DOCUMENT";
  status: "UPLOADING" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
  storageKey: string;
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  originalFileName: string;
};
type VariantRow = {
  name: string;
  storageKey: string;
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  width: number;
  height: number;
};
type LinkRow = { itemId: string; visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC" };

export type ResolvedMediaRead = {
  storageKey: string;
  mimeType: string;
  checksumSha256: string;
  byteSize: bigint | number;
  public: boolean;
  download: boolean;
};

const variants = { thumbnail: "THUMBNAIL", medium: "MEDIUM", large: "LARGE" } as const;
const checksum = /^[a-f0-9]{64}$/;

/** Resolves server-owned links and visibility; never accepts a role or visibility from the request. */
export function createMediaReadService(
  database: QueryDatabase,
  loadItem: (id: string) => Promise<ItemVisibility>,
) {
  async function resolveRead(
    userId: string | null,
    assetIdInput: string,
    variantInput: string,
  ): Promise<ResolvedMediaRead | null> {
    const id = MediaAssetSchema.shape.id.safeParse(assetIdInput);
    if (!id.success || (variantInput !== "original" && !Object.hasOwn(variants, variantInput)))
      return null;
    const assetRows = await database.$queryRaw<AssetRow[]>`
      SELECT "id", "ownerId", "kind", "status", "storageKey", "mimeType", "byteSize",
             "checksumSha256", "originalFileName"
      FROM "MediaAsset" WHERE "id" = ${id.data}::uuid
    `;
    const asset = assetRows[0];
    if (!asset || asset.status === "UPLOADING") return null;
    const assetOwnerId = asset.ownerId;
    const owner = userId !== null && userId === assetOwnerId;
    if (
      variantInput !== "original" &&
      (asset.status !== "READY" || !asset.mimeType.startsWith("image/"))
    )
      return null;
    if (
      variantInput === "original" &&
      asset.kind === "DOCUMENT" &&
      asset.status !== "READY" &&
      asset.mimeType === "application/pdf"
    )
      return null;

    if (!owner && asset.status !== "READY") return null;
    const actor = createTrustedActorFacts(
      userId === null ? { type: "ANONYMOUS" } : { type: "AUTHENTICATED", userId },
    );
    const [images, documents, avatars] = await Promise.all([
      database.$queryRaw<
        LinkRow[]
      >`SELECT "itemId" FROM "MediaLink" WHERE "assetId" = ${id.data}::uuid`,
      database.$queryRaw<
        LinkRow[]
      >`SELECT "itemId", "visibility" FROM "DocumentLink" WHERE "assetId" = ${id.data}::uuid`,
      asset.kind === "IMAGE"
        ? database.$queryRaw<
            Array<{ userId: string }>
          >`SELECT "userId" FROM "UserProfile" WHERE "avatarAssetId" = ${id.data}::uuid AND "userId" = ${assetOwnerId}`
        : Promise.resolve([]),
    ]);
    const itemCache = new Map<string, ItemVisibility | null>();
    async function factsFor(itemId: string) {
      if (!itemCache.has(itemId)) {
        try {
          const item = await loadItem(itemId);
          itemCache.set(
            itemId,
            item.facts.type === "ITEM" &&
              item.facts.ownerId === assetOwnerId &&
              item.item.archivedAt === null &&
              item.item.disposedAt === null
              ? item
              : null,
          );
        } catch (error) {
          if (!(error instanceof ResourceQueryError)) throw error;
          itemCache.set(itemId, null);
        }
      }
      return itemCache.get(itemId) ?? null;
    }
    const neededReason = owner ? "OWNER" : "PUBLIC";
    let access: "OWNER" | "PUBLIC" | null = null;
    // Every live reference is checked; a private receipt cannot borrow a public image link.
    for (const link of images) {
      if (asset.kind !== "IMAGE") continue;
      const item = await factsFor(link.itemId);
      if (item && authorize(actor, "item.view", item.facts).reason === neededReason) {
        access = neededReason;
        break;
      }
    }
    if (!access)
      for (const link of documents) {
        if (asset.kind !== "DOCUMENT") continue;
        const item = await factsFor(link.itemId);
        if (!item || item.facts.type !== "ITEM") continue;
        const documentFacts = createTrustedResourceFacts({
          type: "DOCUMENT",
          ownerId: assetOwnerId,
          visibility: link.visibility ?? "PRIVATE",
          ancestorVisibility: [item.facts.visibility, ...item.facts.ancestorVisibility],
          role: null,
          moderation: item.facts.moderation,
          interactionBlocked: item.facts.interactionBlocked,
          protected: link.visibility !== "PUBLIC",
        });
        if (authorize(actor, "document.view", documentFacts).reason === neededReason) {
          access = neededReason;
          break;
        }
      }
    if (!access && avatars.length > 0 && asset.status === "READY") {
      const profileFacts = createTrustedResourceFacts({
        type: "PROFILE",
        ownerId: assetOwnerId,
        visibility: "PUBLIC",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      });
      if (authorize(actor, "profile.view", profileFacts).reason === neededReason)
        access = neededReason;
    }
    if (!access) return null;
    const publiclyAuthorized = access === "PUBLIC";

    if (variantInput === "original") {
      // Originals of image MIME types can retain EXIF/GPS; ownership is mandatory.
      if (!owner && (asset.mimeType !== "application/pdf" || asset.kind !== "DOCUMENT"))
        return null;
      if (!checksum.test(asset.checksumSha256) || asset.byteSize <= 0n) return null;
      return {
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        checksumSha256: asset.checksumSha256,
        byteSize: asset.byteSize,
        public: publiclyAuthorized,
        download: asset.mimeType === "application/pdf",
      };
    }
    const rows = await database.$queryRaw<VariantRow[]>`
      SELECT "name", "storageKey", "mimeType", "byteSize", "checksumSha256", "width", "height"
      FROM "MediaVariant" WHERE "assetId" = ${id.data}::uuid AND "name" = ${variants[variantInput as keyof typeof variants]}
    `;
    const variant = rows[0];
    if (
      !variant ||
      variant.name !== variants[variantInput as keyof typeof variants] ||
      variant.mimeType !== "image/webp" ||
      variant.byteSize <= 0n ||
      variant.width <= 0 ||
      variant.height <= 0 ||
      !checksum.test(variant.checksumSha256)
    )
      return null;
    return {
      storageKey: variant.storageKey,
      mimeType: variant.mimeType,
      checksumSha256: variant.checksumSha256,
      byteSize: variant.byteSize,
      public: publiclyAuthorized,
      download: false,
    };
  }
  return { resolveRead };
}
