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
    { LocalPersistentStorage },
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
  const storage = new LocalPersistentStorage(serverEnv.UPLOADS_DIR);
  const processImage = createImageProcessor(repository, storage, {
    maxImageBytes: serverEnv.MEDIA_MAX_IMAGE_BYTES,
    maxDocumentBytes: serverEnv.MEDIA_MAX_DOCUMENT_BYTES,
    maxPixels: serverEnv.MEDIA_MAX_IMAGE_PIXELS,
  });
  const withAssetLock = createMediaAssetLocker(serverEnv.DATABASE_URL);
  // Register before queue.start locks the registry.
  registry.register(IMAGE_JOB, async ({ assetId }: { assetId: string }) => {
    if (typeof assetId !== "string") return;
    await withAssetLock(assetId, () => processImage({ assetId }));
  });
  const imageDispatcher = createImageDispatcher(repository, client, console);
  await worker.startWorker({
    queue: runtime,
    imageDispatcher,
    databaseHealth: () => checkDatabaseHealth(prisma),
    disconnectDatabase: () => prisma.$disconnect(),
    healthPort: serverEnv.WORKER_HEALTH_PORT,
    logger: console,
  });
}

void runWorkerMain(startProductionWorker).then((exitCode) => {
  process.exitCode = exitCode;
});
