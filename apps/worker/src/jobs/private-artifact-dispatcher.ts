import { TABULAR_EXPORT_JOB } from "./tabular-export-runtime";

export interface ExportDispatchRepository {
  dispatchCandidates(limit: number): Promise<string[]>;
  noteDispatched(jobId: string): Promise<void>;
}

export function createPrivateArtifactDispatcher(
  repository: ExportDispatchRepository,
  queue: {
    enqueue(
      name: string,
      payload: { jobId: string },
      options: { singletonKey: string },
    ): Promise<string>;
  },
  logger: Pick<Console, "error">,
  intervalMs = 12_000,
  jobName: "exports.build-tabular" | "reports.build-insurance" = TABULAR_EXPORT_JOB,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  async function dispatchOnce(): Promise<void> {
    const candidates = await repository.dispatchCandidates(32);
    for (const jobId of candidates) {
      try {
        await queue.enqueue(jobName, { jobId }, { singletonKey: jobId });
        await repository.noteDispatched(jobId);
      } catch {
        // The durable row is still eligible; the next poll retries a queue outage.
        logger.error("Export dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw new Error("Export dispatcher is already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Export dispatch scan failed"))
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
