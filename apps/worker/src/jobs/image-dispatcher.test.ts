import { describe, expect, it, vi } from "vitest";

import { createImageDispatcher } from "./image-dispatcher";

describe("durable image dispatch", () => {
  it("queues a bounded batch of pending or expired processing rows and advances the cursor", async () => {
    const candidates = Array.from({ length: 40 }, (_, i) => `asset-${i}`);
    const sent: string[] = [];
    const noted: string[] = [];
    const repo = {
      dispatchCandidates: async (limit: number) => candidates.slice(0, limit),
      noteDispatched: async (id: string) => {
        noted.push(id);
      },
    };
    const queue = {
      enqueue: async (
        _name: string,
        data: { assetId: string },
        options: { singletonKey: string },
      ) => {
        expect(options.singletonKey).toBe(data.assetId);
        sent.push(data.assetId);
        return data.assetId;
      },
    };
    const dispatcher = createImageDispatcher(repo, queue, { error: vi.fn() });
    await dispatcher.dispatchOnce();
    expect(sent).toHaveLength(32);
    expect(noted).toEqual(sent);
  });

  it("leaves a failed enqueue eligible for the next poll and stops its timer", async () => {
    vi.useFakeTimers();
    try {
      let sent = 0;
      const noted: string[] = [];
      const repo = {
        dispatchCandidates: async () => ["asset"],
        noteDispatched: async (id: string) => {
          noted.push(id);
        },
      };
      const queue = {
        enqueue: async () => {
          sent++;
          if (sent === 1) throw new Error("queue down");
          return "job";
        },
      };
      const dispatcher = createImageDispatcher(repo, queue, { error: vi.fn() });
      await dispatcher.dispatchOnce();
      expect(noted).toEqual([]);
      await dispatcher.dispatchOnce();
      expect(noted).toEqual(["asset"]);
      dispatcher.start();
      await vi.advanceTimersByTimeAsync(12_000);
      await dispatcher.stop();
      const stopped = sent;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sent).toBe(stopped);
    } finally {
      vi.useRealTimers();
    }
  });
});
