import { z } from "zod";
import type { BillingSyncProvider } from "@sammlerraum/billing/types";
import type { createBillingWebhookService } from "@sammlerraum/domain/billing/webhook-service";
export const BILLING_SYNC_JOB = "billing.sync-receipt";
const Payload = z.strictObject({ receiptId: z.string().uuid() });
export function createBillingSyncJob(
  service: Pick<ReturnType<typeof createBillingWebhookService>, "processReceipt">,
  provider: BillingSyncProvider,
) {
  return async (input: unknown, context?: { signal: AbortSignal }) => {
    const parsed = Payload.safeParse(input);
    if (!parsed.success || context?.signal.aborted) return;
    await service.processReceipt(
      parsed.data.receiptId,
      provider,
      context ? { signal: context.signal } : {},
    );
  };
}
export function createBillingDispatcher(
  repository: {
    dispatchCandidates(limit: number): Promise<string[]>;
    noteDispatched(id: string): Promise<void>;
  },
  queue: {
    enqueue(
      name: string,
      payload: { receiptId: string },
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
          BILLING_SYNC_JOB,
          { receiptId: id },
          { singletonKey: id, retryLimit: 0 },
        );
        await repository.noteDispatched(id);
      } catch {
        logger.error("Billing dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw Error("Billing dispatcher already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Billing dispatch scan failed"))
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
