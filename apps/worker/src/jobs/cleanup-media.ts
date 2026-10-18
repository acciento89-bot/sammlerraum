import type { StorageProvider } from "@sammlerraum/storage";

export type MediaLocker = <T>(id: string, work: () => Promise<T>) => Promise<T | false>;
export interface CleanupRepository {
  findDeletableAssets(): Promise<string[]>;
  prepareDeletion(assetId: string): Promise<string[] | null>;
  finishDeletion(assetId: string): Promise<void>;
  findTombstones(): Promise<Array<{ assetId: string; storageKey: string }>>;
  noteReconciled(key: string): Promise<void>;
}
export function createMediaCleanupJob(
  repository: CleanupRepository,
  storage: StorageProvider,
  withLock: MediaLocker,
  logger: Pick<Console, "error">,
  options: { intervalMs?: number; cleanupTemporary?: () => Promise<unknown> } = {},
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  async function run() {
    for (const assetId of await repository.findDeletableAssets()) {
      try {
        await withLock(assetId, async () => {
          const keys = await repository.prepareDeletion(assetId);
          if (!keys) return;
          for (const key of keys) await storage.delete(key);
          await repository.finishDeletion(assetId);
        });
      } catch {
        logger.error("Media cleanup failed");
      }
    }
    for (const tombstone of await repository.findTombstones()) {
      try {
        await withLock(tombstone.assetId, () => storage.delete(tombstone.storageKey));
      } catch {
        logger.error("Media reconciliation failed");
      } finally {
        await repository.noteReconciled(tombstone.storageKey);
      }
    }
    await options.cleanupTemporary?.();
  }
  return {
    run,
    start() {
      if (timer) throw new Error("Media cleanup already started");
      const tick = () => {
        if (running) return;
        running = run()
          .catch(() => logger.error("Media cleanup scan failed"))
          .finally(() => {
            running = undefined;
          });
      };
      tick();
      timer = setInterval(tick, options.intervalMs ?? 60_000);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
