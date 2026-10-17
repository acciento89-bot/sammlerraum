import type { StorageCleanupCursor } from "@sammlerraum/storage";
import { createMediaCleanupService } from "@sammlerraum/domain/media/cleanup-service";
import { createMediaCleanupJob } from "./jobs/cleanup-media";
import { runWorkerMain } from "./main";
import { createImageDispatcher } from "./jobs/image-dispatcher";
import { createPrismaImageRepository } from "./jobs/image-repository";
import { createImageProcessor, IMAGE_JOB } from "./jobs/process-image";

async function startProductionWorker(): Promise<void> {
  const [
    { serverEnv },
    { prisma },
    { checkDatabaseHealth },
    { createPgBossServices },
    { LocalPersistentStorage, cleanupLocalStorageTemporaryFiles },
    { createMediaAssetLocker },
    worker,
  ] = await Promise.all([
    import("@sammlerraum/config/server"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/db/health"),
    import("@sammlerraum/queue"),
    import("@sammlerraum/storage"),
    import("@sammlerraum/db/media-lock"),
    import("./main"),
  ]);
  const { runtime, client, registry } = createPgBossServices(serverEnv.DATABASE_URL);
  const repository = createPrismaImageRepository(prisma);
  const withAssetLock = createMediaAssetLocker(serverEnv.DATABASE_URL);
  const storage = new LocalPersistentStorage(serverEnv.UPLOADS_DIR, withAssetLock);
  const stagingCursor: StorageCleanupCursor = {};
  const mediaCleanup = createMediaCleanupJob(
    createMediaCleanupService(prisma, {
      retentionHours: serverEnv.MEDIA_RETENTION_HOURS,
      batchSize: serverEnv.MEDIA_CLEANUP_BATCH_SIZE,
    }),
    storage,
    withAssetLock,
    console,
    {
      intervalMs: serverEnv.MEDIA_CLEANUP_INTERVAL_MS,
      cleanupTemporary: () =>
        cleanupLocalStorageTemporaryFiles(serverEnv.UPLOADS_DIR, {
          maxAgeHours: serverEnv.STORAGE_TEMP_MAX_AGE_HOURS,
          withLock: withAssetLock,
          cursor: stagingCursor,
          maxEntries: 1000,
        }),
    },
  );
  const processImage = createImageProcessor(repository, storage, {
    maxImageBytes: serverEnv.MEDIA_MAX_IMAGE_BYTES,
    maxDocumentBytes: serverEnv.MEDIA_MAX_DOCUMENT_BYTES,
    maxPixels: serverEnv.MEDIA_MAX_IMAGE_PIXELS,
  });
  // Register before queue.start locks the registry.
  registry.register(IMAGE_JOB, async ({ assetId }: { assetId: string }) => {
    if (typeof assetId !== "string") return;
    await withAssetLock(assetId, () => processImage({ assetId }));
  });
  const imageDispatcher = createImageDispatcher(repository, client, console);
  await worker.startWorker({
    queue: runtime,
    imageDispatcher,
    mediaCleanup,
    databaseHealth: () => checkDatabaseHealth(prisma),
    disconnectDatabase: () => prisma.$disconnect(),
    healthPort: serverEnv.WORKER_HEALTH_PORT,
    logger: console,
  });
}

void runWorkerMain(startProductionWorker).then((exitCode) => {
  process.exitCode = exitCode;
});
