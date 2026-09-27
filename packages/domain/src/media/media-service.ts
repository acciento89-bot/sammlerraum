import { createHash, randomUUID } from "node:crypto";

import {
  MediaAssetSchema,
  LinkAssetInputSchema,
  type LinkAssetInput,
} from "@sammlerraum/contracts/media";
import type { createPrismaClient } from "@sammlerraum/db/create-client";
import type { StorageProvider } from "@sammlerraum/storage";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export type MediaDatabase = ReturnType<typeof createPrismaClient>;
export type UploadMetadata = { fileName: string; claimedMime: string };
export type MediaLimits = {
  maxImageBytes: number;
  maxDocumentBytes: number;
  maxImagePixels: number;
};
export const defaultMediaLimits: MediaLimits = {
  maxImageBytes: 20 * 1024 * 1024,
  maxDocumentBytes: 25 * 1024 * 1024,
  maxImagePixels: 40_000_000,
};

export type MediaServiceErrorCode =
  | "UPLOAD_TOO_LARGE"
  | "UNSUPPORTED_IMAGE"
  | "UNSUPPORTED_DOCUMENT"
  | "IMAGE_TOO_LARGE"
  | "INVALID_IMAGE"
  | "INVALID_UPLOAD"
  | "ASSET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "UNSUPPORTED_TARGET"
  | "ASSET_KIND_MISMATCH"
  | "ASSET_NOT_READY"
  | "LINK_ALREADY_EXISTS";

export class MediaServiceError extends Error {
  constructor(readonly code: MediaServiceErrorCode) {
    super(code);
    this.name = "MediaServiceError";
  }
}

const allowed = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
const extensions: Record<keyof typeof allowed, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

function limitsWithDefaults(input: Partial<MediaLimits>): MediaLimits {
  const limits = { ...defaultMediaLimits, ...input };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new RangeError("Media limits must be positive safe integers");
  }
  return limits;
}

function fileName(input: string): string {
  if (
    typeof input !== "string" ||
    input.length > 255 ||
    input.length === 0 ||
    input.includes("/") ||
    input.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(input)
  )
    throw new MediaServiceError("INVALID_UPLOAD");
  return input;
}

function serialize(row: {
  id: string;
  kind: "IMAGE" | "DOCUMENT";
  status: "UPLOADING" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  originalFileName: string;
}) {
  return MediaAssetSchema.parse({ ...row, byteSize: Number(row.byteSize) });
}

export function createMediaService(
  database: MediaDatabase,
  storage: StorageProvider,
  configuredLimits: Partial<MediaLimits> = {},
) {
  const limits = limitsWithDefaults(configuredLimits);

  async function upload(
    actorUserId: string,
    bytes: Uint8Array,
    meta: UploadMetadata,
    kind: "IMAGE" | "DOCUMENT",
  ) {
    const unsupported = kind === "IMAGE" ? "UNSUPPORTED_IMAGE" : "UNSUPPORTED_DOCUMENT";
    const name = fileName(meta.fileName);
    const max = kind === "IMAGE" ? limits.maxImageBytes : limits.maxDocumentBytes;
    if (bytes.byteLength > max) throw new MediaServiceError("UPLOAD_TOO_LARGE");
    if (bytes.byteLength === 0) throw new MediaServiceError(unsupported);
    const detected = await fileTypeFromBuffer(bytes);
    const mime = detected?.mime;
    if (
      !mime ||
      !(mime in allowed) ||
      (kind === "IMAGE" && mime === "application/pdf") ||
      meta.claimedMime !== mime ||
      !extensions[mime as keyof typeof allowed].includes(
        name.split(".").at(-1)?.toLowerCase() ?? "",
      )
    )
      throw new MediaServiceError(unsupported);

    let width: number | null = null;
    let height: number | null = null;
    if (mime === "application/pdf") {
      // The signature detector is only a hint; reject obviously truncated documents.
      if (
        !Buffer.from(bytes).subarray(0, 8).toString("ascii").startsWith("%PDF-") ||
        !Buffer.from(bytes).subarray(-1024).toString("latin1").includes("%%EOF")
      ) {
        throw new MediaServiceError("UNSUPPORTED_DOCUMENT");
      }
    } else {
      try {
        const decoder = sharp(bytes, {
          failOn: "warning",
          limitInputPixels: limits.maxImagePixels,
        });
        const info = await decoder.metadata();
        if (
          !info.width ||
          !info.height ||
          (info.pages && info.pages > 1) ||
          info.width * info.height > limits.maxImagePixels
        ) {
          throw new MediaServiceError("IMAGE_TOO_LARGE");
        }
        if (info.mediaType !== mime) throw new MediaServiceError(unsupported);
        width = info.width;
        height = info.height;
        // Force decoding all source pixels now, before accepting the original.
        await decoder.raw().toBuffer();
      } catch (error) {
        if (error instanceof MediaServiceError) throw error;
        if (error instanceof Error && /pixel limit|exceeds pixel/i.test(error.message)) {
          throw new MediaServiceError("IMAGE_TOO_LARGE");
        }
        throw new MediaServiceError("INVALID_IMAGE");
      }
    }

    const id = randomUUID();
    const storageKey = `originals/${id}`;
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    // This row must commit before put: failures leave a discoverable key for Task 5 cleanup.
    const intent = await database.mediaAsset.create({
      data: {
        id,
        ownerId: actorUserId,
        kind,
        status: "UPLOADING",
        storageKey,
        mimeType: mime,
        byteSize: BigInt(bytes.byteLength),
        checksumSha256,
        width,
        height,
        originalFileName: name,
      },
    });
    await storage.put(storageKey, bytes);
    // PENDING is the durable processing intent for all image MIME, including image documents.
    const saved = await database.mediaAsset.update({
      where: { id: intent.id },
      data: { status: mime === "application/pdf" ? "READY" : "PENDING" },
    });
    return serialize(saved);
  }

  return {
    createImageUpload: (actorUserId: string, bytes: Uint8Array, meta: UploadMetadata) =>
      upload(actorUserId, bytes, meta, "IMAGE"),
    createDocumentUpload: (actorUserId: string, bytes: Uint8Array, meta: UploadMetadata) =>
      upload(actorUserId, bytes, meta, "DOCUMENT"),
    async linkAsset(actorUserId: string, input: LinkAssetInput) {
      if (input.target !== "ITEM" && input.target !== "ITEM_DOCUMENT") {
        throw new MediaServiceError("UNSUPPORTED_TARGET");
      }
      const data = LinkAssetInputSchema.parse(input);
      try {
        return await database.$transaction(
          async (tx) => {
            // Lock item first, matching quantity-split lock ordering. Deleted parents are hidden.
            const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT item."id" FROM "CollectibleItem" item
            JOIN "Collection" collection ON collection."id" = item."collectionId"
            WHERE item."id" = ${data.itemId}::uuid AND item."ownerId" = ${actorUserId}
              AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
            FOR UPDATE OF item
          `;
            if (!rows[0]) throw new MediaServiceError("ITEM_NOT_FOUND");
            const asset = await tx.mediaAsset.findFirst({
              where: { id: data.assetId, ownerId: actorUserId },
            });
            if (!asset) throw new MediaServiceError("ASSET_NOT_FOUND");
            if (
              asset.status !== "PENDING" &&
              asset.status !== "PROCESSING" &&
              asset.status !== "READY"
            ) {
              throw new MediaServiceError("ASSET_NOT_READY");
            }
            if (data.target === "ITEM") {
              if (asset.kind !== "IMAGE") throw new MediaServiceError("ASSET_KIND_MISMATCH");
              const last = await tx.mediaLink.findFirst({
                where: { itemId: data.itemId },
                orderBy: { position: "desc" },
              });
              const link = await tx.mediaLink.create({
                data: {
                  ownerId: actorUserId,
                  itemId: data.itemId,
                  assetId: data.assetId,
                  purpose: data.purpose,
                  title: data.title ?? null,
                  position: (last?.position ?? -1) + 1,
                },
              });
              return {
                id: link.id,
                itemId: link.itemId,
                assetId: link.assetId,
                purpose: link.purpose,
                title: link.title,
                position: link.position,
              };
            }
            if (asset.kind !== "DOCUMENT") throw new MediaServiceError("ASSET_KIND_MISMATCH");
            const last = await tx.documentLink.findFirst({
              where: { itemId: data.itemId },
              orderBy: { position: "desc" },
            });
            const link = await tx.documentLink.create({
              data: {
                ownerId: actorUserId,
                itemId: data.itemId,
                assetId: data.assetId,
                category: data.category,
                visibility: data.visibility,
                title: data.title ?? null,
                position: (last?.position ?? -1) + 1,
              },
            });
            return {
              id: link.id,
              itemId: link.itemId,
              assetId: link.assetId,
              category: link.category,
              visibility: link.visibility,
              title: link.title,
              position: link.position,
            };
          },
          { isolationLevel: "ReadCommitted" },
        );
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          throw new MediaServiceError("LINK_ALREADY_EXISTS");
        }
        throw error;
      }
    },
  };
}
