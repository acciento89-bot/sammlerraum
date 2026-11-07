import { NOTIFICATION_EMAIL_JOB } from "./send-email";
export function createNotificationEmailDispatcher(
  repo: { dispatchCandidates(limit: number): Promise<string[]> },
  queue: {
    enqueue(
      name: string,
      payload: { deliveryId: string },
      options: { singletonKey: string },
    ): Promise<string>;
  },
  logger: Pick<Console, "error">,
  intervalMs = 12000,
) {
  let timer: ReturnType<typeof setInterval> | undefined, running: Promise<void> | undefined;
  async function dispatchOnce() {
    for (const deliveryId of await repo.dispatchCandidates(32)) {
      try {
        await queue.enqueue(NOTIFICATION_EMAIL_JOB, { deliveryId }, { singletonKey: deliveryId });
      } catch {
        logger.error("Notification email dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw Error("Notification dispatcher already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Notification email scan failed"))
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
