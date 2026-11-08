import { it, expect, vi } from "vitest";
import { createInsuranceReportDispatcher } from "./insurance-report-dispatcher";
it("dispatches the real report queue name and leaves an unacknowledged intent retryable", async () => {
  let attempt = 0;
  const note = vi.fn(async () => {}),
    queue = {
      enqueue: vi.fn(
        async (name: string, payload: { jobId: string }, options: { singletonKey: string }) => {
          expect(name).toBe("reports.build-insurance");
          expect(payload).toEqual({ jobId: "owned-job" });
          expect(options.singletonKey).toBe("owned-job");
          if (++attempt === 1) throw new Error("private outage data");
          return "queue-id";
        },
      ),
    };
  const logger = { error: vi.fn() },
    dispatcher = createInsuranceReportDispatcher(
      { dispatchCandidates: async () => ["owned-job"], noteDispatched: note },
      queue,
      logger,
    );
  await dispatcher.dispatchOnce();
  expect(note).not.toHaveBeenCalled();
  await dispatcher.dispatchOnce();
  expect(note).toHaveBeenCalledWith("owned-job");
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain("private outage data");
});
