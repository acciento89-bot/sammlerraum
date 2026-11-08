import { AI_ANALYZE_ITEM_JOB } from "./analyze-item";
export function createAIAnalysisDispatcher(
  repository: {
    dispatchCandidates(limit: number): Promise<string[]>;
    noteDispatched(id: string): Promise<void>;
  },
  queue: {
    enqueue(
      name: string,
      payload: { analysisJobId: string },
      options: { singletonKey: string; retryLimit: number },
    ): Promise<string>;
  },
  logger: Pick<Console, "error">,
  intervalMs = 12000,
) {
  let timer: ReturnType<typeof setInterval> | undefined, running: Promise<void> | undefined;
  async function dispatchOnce() {
    for (const id of await repository.dispatchCandidates(32)) {
      try {
        await queue.enqueue(
          AI_ANALYZE_ITEM_JOB,
          { analysisJobId: id },
          { singletonKey: id, retryLimit: 0 },
        );
        await repository.noteDispatched(id);
      } catch {
        logger.error("Analysis dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw new Error("Analysis dispatcher already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Analysis dispatch scan failed"))
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
