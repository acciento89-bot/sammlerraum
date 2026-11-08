import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
async function implementation() {
  const path = "./billing-sync",
    m = await import(path).catch(() => null);
  expect(m?.createBillingSyncJob, "real cancellable billing job").toBeTypeOf("function");
  return m!;
}
it("queues only an opaque receipt and forwards cancellation to actual reconciliation", async () => {
  const m = await implementation(),
    id = randomUUID(),
    controller = new AbortController();
  let received: unknown;
  const job = m.createBillingSyncJob(
    {
      processReceipt: async (...args: unknown[]) => {
        received = args;
      },
    },
    { id: "stripe" },
  );
  await job({ receiptId: id }, { signal: controller.signal });
  expect(received).toEqual([id, { id: "stripe" }, { signal: controller.signal }]);
  received = undefined;
  await job({ receiptId: id, customerId: "cus_foreign" });
  expect(received).toBeUndefined();
  controller.abort();
  await job({ receiptId: id }, { signal: controller.signal });
  expect(received).toBeUndefined();
});
it("records a dispatch only after queue acknowledgment and preserves recovery on enqueue failure", async () => {
  const m = await implementation(),
    id = randomUUID(),
    order: string[] = [];
  const repo = {
    dispatchCandidates: async () => [id],
    noteDispatched: async (value: string) => {
      expect(value).toBe(id);
      order.push("noted");
    },
  };
  const queue = {
    enqueue: async (name: string, payload: unknown, options: unknown) => {
      expect(name).toBe(m.BILLING_SYNC_JOB);
      expect(payload).toEqual({ receiptId: id });
      expect(options).toEqual({ singletonKey: id, retryLimit: 0 });
      order.push("queued");
      return "owned-job";
    },
  };
  const dispatcher = m.createBillingDispatcher(repo, queue, { error: () => {} });
  await dispatcher.dispatchOnce();
  expect(order).toEqual(["queued", "noted"]);
  order.length = 0;
  const failed = m.createBillingDispatcher(
    repo,
    {
      enqueue: async () => {
        throw Error("private-provider-error");
      },
    },
    {
      error: (message: string) => {
        expect(message).not.toContain("private-provider-error");
      },
    },
  );
  await failed.dispatchOnce();
  expect(order).toEqual([]);
});
