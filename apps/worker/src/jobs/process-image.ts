import { createHash } from "node:crypto";

import sharp from "sharp";
import type { StorageProvider } from "@sammlerraum/storage";

export const IMAGE_JOB = "media.process-image";
export const IMAGE_VARIANTS = [
  { name: "THUMBNAIL", edge: 256 },
  { name: "MEDIUM", edge: 640 },
  { name: "LARGE", edge: 1600 },
] as const;
export type VariantName = (typeof IMAGE_VARIANTS)[number]["name"];
export type ImageErrorCode =
  | "SOURCE_INVALID"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_MISSING"
  | "STORAGE_ERROR"
  | "PROCESSING_ERROR";

export type ImageClaim = {
  id: string;
  token: string;
  kind: "IMAGE" | "DOCUMENT";
  mimeType: string;
  storageKey: string;
  byteSize: bigint;
  checksumSha256: string;
};

export type VariantData = {
  width: number;
  height: number;
  size: bigint;
  checksum: string;
};

export interface ImageRepository {
  claim(assetId: string): Promise<ImageClaim | null>;
  renew(claim: ImageClaim): Promise<boolean>;
  reserveVariant(claim: ImageClaim, name: VariantName, key: string): Promise<boolean>;
  finishVariant(claim: ImageClaim, name: VariantName, data: VariantData): Promise<boolean>;
  ready(claim: ImageClaim): Promise<boolean>;
  fail(claim: ImageClaim, code: ImageErrorCode, retry: boolean): Promise<void>;
}

const imageMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class ProcessingFailure extends Error {
  constructor(
    readonly code: ImageErrorCode,
    readonly retry: boolean,
  ) {
    super(code);
  }
}

async function guardedRead(storage: StorageProvider, key: string): Promise<Uint8Array> {
  try {
    return await storage.read(key);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "STORAGE_NOT_FOUND") {
      throw new ProcessingFailure("SOURCE_MISSING", false);
    }
    throw new ProcessingFailure("STORAGE_ERROR", true);
  }
}

export function createImageProcessor(
  repository: ImageRepository,
  storage: StorageProvider,
  limits: { maxImageBytes?: number; maxDocumentBytes?: number; maxPixels?: number } = {},
) {
  const maxPixels = limits.maxPixels ?? 40_000_000;
  return async ({ assetId }: { assetId: string }): Promise<void> => {
    if (typeof assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(assetId)) return;
    const claim = await repository.claim(assetId);
    if (!claim) return;
    try {
      const maxBytes =
        claim.kind === "DOCUMENT"
          ? (limits.maxDocumentBytes ?? 25 * 1024 * 1024)
          : (limits.maxImageBytes ?? 20 * 1024 * 1024);
      if (
        !imageMimes.has(claim.mimeType) ||
        claim.byteSize > BigInt(maxBytes) ||
        claim.byteSize <= 0n
      ) {
        throw new ProcessingFailure("SOURCE_TOO_LARGE", false);
      }
      const bytes = await guardedRead(storage, claim.storageKey);
      if (bytes.byteLength !== Number(claim.byteSize) || digest(bytes) !== claim.checksumSha256) {
        throw new ProcessingFailure("SOURCE_INVALID", false);
      }
      let pixels: Buffer;
      let raw: { width: number; height: number; channels: 1 | 2 | 3 | 4 };
      try {
        const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: maxPixels });
        const meta = await decoder.metadata();
        if (
          meta.mediaType !== claim.mimeType ||
          !meta.width ||
          !meta.height ||
          (meta.pages && meta.pages > 1) ||
          meta.width * meta.height > maxPixels
        ) {
          throw new ProcessingFailure("SOURCE_INVALID", false);
        }
        const decoded = await decoder.rotate().raw().toBuffer({ resolveWithObject: true });
        pixels = decoded.data;
        raw = {
          width: decoded.info.width,
          height: decoded.info.height,
          channels: decoded.info.channels as 1 | 2 | 3 | 4,
        };
      } catch (error) {
        if (error instanceof ProcessingFailure) throw error;
        throw new ProcessingFailure(
          error instanceof Error && /pixel limit|exceeds pixel/i.test(error.message)
            ? "SOURCE_TOO_LARGE"
            : "SOURCE_INVALID",
          false,
        );
      }
      for (const { name, edge } of IMAGE_VARIANTS) {
        if (!(await repository.renew(claim))) return;
        const key = `variants/${claim.id}/${name.toLowerCase()}.webp`;
        if (!(await repository.reserveVariant(claim, name, key))) return;
        let output: Buffer;
        let info: { width: number; height: number };
        try {
          const encoded = await sharp(pixels, { raw })
            .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
            .webp()
            .toBuffer({ resolveWithObject: true });
          output = encoded.data;
          info = encoded.info;
        } catch {
          throw new ProcessingFailure("PROCESSING_ERROR", false);
        }
        if (!(await repository.renew(claim))) return;
        try {
          await storage.put(key, output);
        } catch {
          throw new ProcessingFailure("STORAGE_ERROR", true);
        }
        if (
          !(await repository.finishVariant(claim, name, {
            width: info.width,
            height: info.height,
            size: BigInt(output.byteLength),
            checksum: digest(output),
          }))
        )
          return;
      }
      await repository.ready(claim);
    } catch (error) {
      const failure =
        error instanceof ProcessingFailure
          ? error
          : new ProcessingFailure("PROCESSING_ERROR", true);
      await repository.fail(claim, failure.code, failure.retry);
    }
  };
}
