import { createHash } from "node:crypto";
import {
  ImportUploadInputSchema,
  IMPORT_MAX_SOURCE_BYTES,
  importFail,
} from "@sammlerraum/contracts/imports";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import { runSearchTransaction, type SearchDatabase } from "../search/search-read";
import { createImportService } from "./import-service";

/** The manifest exists before I/O. Its completion fence alone enables processing. */
export function createImportWorkflowService(
  database: SearchDatabase,
  storage: StorageProvider,
  lock: StorageStagingLocker,
) {
  const core = createImportService(database);
  return {
    async uploadImport(actor: { userId: string }, input: unknown, bytes: Uint8Array) {
      const checked = ImportUploadInputSchema.safeParse(input);
      if (
        !checked.success ||
        !(bytes instanceof Uint8Array) ||
        !bytes.byteLength ||
        bytes.byteLength > IMPORT_MAX_SOURCE_BYTES
      )
        return importFail("IMPORT_INVALID");
      const value = checked.data,
        checksum = createHash("sha256").update(bytes).digest("hex");
      const job = await core.createImportJob(
        actor,
        {
          collectionId: value.collectionId,
          locale: value.locale,
          source: {
            format: value.format,
            fileName: value.fileName,
            byteSize: String(bytes.byteLength),
            checksumSha256: checksum,
          },
        },
        { requestId: value.uploadRequestId, options: value.parserOptions },
      );
      const result = await lock(
        `import-source:${job.id}`,
        async () => {
          const manifest = async () =>
            runSearchTransaction(database, async (tx) => {
              const rows = await tx.$queryRaw<
                { sourceStorageKey: string; uploadCompletedAt: Date | null; expired: boolean }[]
              >(
                Prisma.sql`SELECT j."sourceStorageKey",j."uploadCompletedAt",j."sourceExpiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE j.id=${job.id}::uuid AND j."ownerId"=${actor.userId} AND c."deletedAt" IS NULL`,
              );
              if (rows.length !== 1) return importFail("IMPORT_NOT_FOUND");
              if (rows[0]!.expired) return importFail("IMPORT_CONFLICT");
              return rows[0]!;
            });
          const current = await manifest();
          if (!current.uploadCompletedAt) {
            try {
              await storage.put(current.sourceStorageKey, bytes);
            } catch {
              return searchFail("SEARCH_UNAVAILABLE");
            }
            // Recheck live permission and expiry after the actual write settles.
            await runSearchTransaction(database, async (tx) => {
              const rows = await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`UPDATE "ImportJob" j SET "uploadCompletedAt"=date_trunc('milliseconds',clock_timestamp()),"parserOptions"=j."uploadOptions",revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) FROM "Collection" c WHERE j.id=${job.id}::uuid AND j."ownerId"=${actor.userId} AND c.id=j."collectionId" AND c."ownerId"=j."ownerId" AND c."deletedAt" IS NULL AND j."sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP) AND j."uploadCompletedAt" IS NULL AND j.status='AWAITING_UPLOAD' RETURNING j.id`,
              );
              if (rows.length !== 1) return importFail("IMPORT_CONFLICT");
            });
          }
          return { job: await core.getImportJob(actor, job.id), uploadReady: true };
        },
        true,
      );
      if (result === false) return searchFail("SEARCH_UNAVAILABLE");
      return result;
    },
  };
}
