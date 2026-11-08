import { IMAGE_JOB } from "./process-image";

export interface ImageDispatchRepository {
  dispatchCandidates(limit: number): Promise<string[]>;
  noteDispatched(assetId: string): Promise<void>;
}

export function createImageDispatcher(
  repository: ImageDispatchRepository,
  queue: {
    enqueue(
      name: string,
      payload: { assetId: string },
      options: { singletonKey: string },
    ): Promise<string>;
  },
  logger: Pick<Console, "error">,
  intervalMs = 12_000,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  async function dispatchOnce(): Promise<void> {
    const candidates = await repository.dispatchCandidates(32);
    for (const assetId of candidates) {
      try {
        await queue.enqueue(IMAGE_JOB, { assetId }, { singletonKey: assetId });
        await repository.noteDispatched(assetId);
      } catch {
        // The durable row is still eligible; the next poll retries a queue outage.
        logger.error("Image dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw new Error("Image dispatcher is already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Image dispatch scan failed"))
          .finally(() => {
            running = undefined;
          });
      };
      tick();
      timer = setInterval(tick, intervalMs);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
