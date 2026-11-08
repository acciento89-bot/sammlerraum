import { expect, it, vi } from "vitest";
it("durably retries queue failures and queues only an opaque analysis job id", async () => {
  const path = "./ai-analysis-dispatcher";
  const module = await import(path).catch(() => null);
  expect(module?.createAIAnalysisDispatcher).toBeTypeOf("function");
  const note = vi.fn(async () => {}),
    enqueue = vi.fn(async () => "queued"),
    error = vi.fn();
  enqueue.mockRejectedValueOnce(new Error("private source sentinel"));
  const dispatcher = module!.createAIAnalysisDispatcher(
    { dispatchCandidates: async () => ["id"], noteDispatched: note },
    { enqueue },
    { error },
  );
  await dispatcher.dispatchOnce();
  expect(note).not.toHaveBeenCalled();
  await dispatcher.dispatchOnce();
  expect(note).toHaveBeenCalledWith("id");
  expect(enqueue).toHaveBeenLastCalledWith(
    "ai.analyze-item",
    { analysisJobId: "id" },
    { singletonKey: "id", retryLimit: 0 },
  );
  expect(JSON.stringify(error.mock.calls)).not.toContain("private source sentinel");
});
it("does not overlap scans or finish stop before a queue send settles", async () => {
  const path = "./ai-analysis-dispatcher";
  const module = await import(path).catch(() => null);
  expect(module?.createAIAnalysisDispatcher).toBeTypeOf("function");
  vi.useFakeTimers();
  try {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve)),
      scan = vi.fn(async () => ["id"]);
    const dispatcher = module!.createAIAnalysisDispatcher(
      { dispatchCandidates: scan, noteDispatched: async () => {} },
      {
        enqueue: async () => {
          await held;
          return "queued";
        },
      },
      { error: vi.fn() },
    );
    dispatcher.start();
    await vi.advanceTimersByTimeAsync(36000);
    expect(scan).toHaveBeenCalledOnce();
    let finished = false;
    const stopping = dispatcher.stop().then(() => (finished = true));
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    await stopping;
    await vi.advanceTimersByTimeAsync(36000);
    expect(scan).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
