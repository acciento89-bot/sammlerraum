import { describe, it, expect, vi } from "vitest";
import { createNotificationEmailDispatcher } from "./notification-email-dispatcher";
describe("durable notification email outbox dispatch", () => {
  it("retries queue outages from the durable row with the same delivery singleton key", async () => {
    const repo = { dispatchCandidates: vi.fn(async () => ["owned-delivery-id"]) },
      queue = {
        enqueue: vi
          .fn()
          .mockRejectedValueOnce(Error("private-queue-sentinel"))
          .mockResolvedValue("queue-id"),
      },
      logger = { error: vi.fn() };
    const dispatcher = createNotificationEmailDispatcher(repo, queue, logger);
    await dispatcher.dispatchOnce();
    await dispatcher.dispatchOnce();
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenLastCalledWith(
      "notification.send-email",
      { deliveryId: "owned-delivery-id" },
      { singletonKey: "owned-delivery-id" },
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(
      /private-queue-sentinel|owned-delivery-id/,
    );
  });
});
