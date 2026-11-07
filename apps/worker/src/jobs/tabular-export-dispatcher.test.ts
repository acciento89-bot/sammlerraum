import { describe, it, expect, vi } from "vitest";
import { createTabularExportDispatcher } from "./tabular-export-dispatcher";
describe("durable tabular export dispatch", () => {
  it("retries a queue outage without acknowledging its durable intent or leaking job data", async () => {
    const pending = ["one", "two"];
    const noted: string[] = [],
      sent: string[] = [];
    let outage = true;
    const repo = {
      dispatchCandidates: async (limit: number) => {
        expect(limit).toBe(32);
        return pending;
      },
      noteDispatched: async (id: string) => {
        noted.push(id);
      },
    };
    const logger = { error: vi.fn() };
    const queue = {
      enqueue: async (
        name: string,
        payload: { jobId: string },
        options: { singletonKey: string },
      ) => {
        expect(name).toBe("exports.build-tabular");
        expect(options.singletonKey).toBe(payload.jobId);
        sent.push(payload.jobId);
        if (outage) {
          outage = false;
          throw new Error("private storage path");
        }
        return "queued";
      },
    };
    const dispatcher = createTabularExportDispatcher(repo, queue, logger);
    await dispatcher.dispatchOnce();
    expect(noted).toEqual(["two"]);
    await dispatcher.dispatchOnce();
    expect(noted).toEqual(["two", "one", "two"]);
    expect(sent).toHaveLength(4);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("private storage path");
  });
  it("does not overlap scans and waits for an in-flight queue send before stopping", async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => (release = resolve));
      const scan = vi.fn(async () => ["one"]),
        note = vi.fn(async () => {}),
        send = vi.fn(async () => {
          await barrier;
          return "job";
        });
      const dispatcher = createTabularExportDispatcher(
        { dispatchCandidates: scan, noteDispatched: note },
        { enqueue: send },
        { error: vi.fn() },
      );
      dispatcher.start();
      await vi.advanceTimersByTimeAsync(36000);
      expect(scan).toHaveBeenCalledTimes(1);
      let stopped = false;
      const stopping = dispatcher.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      release();
      await stopping;
      await vi.advanceTimersByTimeAsync(36000);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(note).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
