import { expect, it, vi } from "vitest";
const wiring = vi.hoisted(() => ({
  startWorker: vi.fn(async (_options: unknown) => {}),
  register: vi.fn(),
  registerCancellable: vi.fn(),
  disconnect: vi.fn(async () => {}),
}));
vi.mock("./main", () => ({
  runWorkerMain: async (start: () => Promise<void>) => {
    await start();
    return 0;
  },
  startWorker: wiring.startWorker,
}));
vi.mock("@sammlerraum/config/server", () => ({
  serverEnv: {
    DATABASE_URL: "postgresql://fixture:fixture@localhost/synthetic_test",
    UPLOADS_DIR: "/tmp/synthetic",
    MEDIA_RETENTION_HOURS: 168,
    MEDIA_CLEANUP_BATCH_SIZE: 100,
    MEDIA_CLEANUP_INTERVAL_MS: 60000,
    MEDIA_MAX_IMAGE_BYTES: 20971520,
    MEDIA_MAX_DOCUMENT_BYTES: 26214400,
    MEDIA_MAX_IMAGE_PIXELS: 40000000,
    MARKET_SYNC_ENABLED: false,
    MARKET_SYNC_INTERVAL_MS: 60000,
    MARKET_SYNC_BATCH_SIZE: 32,
    MARKET_SYNC_MAX_PENDING: 256,
  },
}));
vi.mock("@sammlerraum/db/client", () => ({ prisma: { $disconnect: wiring.disconnect } }));
vi.mock("@sammlerraum/db/create-client", () => ({
  createPrismaClient: () => ({ $disconnect: wiring.disconnect }),
}));
vi.mock("@sammlerraum/db/health", () => ({ checkDatabaseHealth: vi.fn() }));
vi.mock("@sammlerraum/db/media-lock", () => ({ createMediaAssetLocker: () => vi.fn() }));
vi.mock("@sammlerraum/queue", () => ({
  createPgBossServices: () => ({
    runtime: {},
    client: {},
    registry: { register: wiring.register, registerCancellable: wiring.registerCancellable },
    producerBackend: { getDb: vi.fn(), send: vi.fn() },
  }),
}));
vi.mock("@sammlerraum/storage", () => ({
  LocalPersistentStorage: class {},
  cleanupLocalStorageTemporaryFiles: vi.fn(),
}));
it("passes the production-composed market lifecycle to startWorker and registers market.sync", async () => {
  await import("./run");
  await vi.waitFor(() => expect(wiring.startWorker).toHaveBeenCalledOnce());
  expect(wiring.registerCancellable).toHaveBeenCalledWith("market.sync", expect.any(Function));
  const options = wiring.startWorker.mock.calls[0]![0] as unknown as {
    marketSync: { start(): void; stop(): Promise<void> };
    disconnectDatabase(): Promise<void>;
  };
  expect(options.marketSync).toEqual({ start: expect.any(Function), stop: expect.any(Function) });
  options.marketSync.start();
  await options.marketSync.stop();
  await options.disconnectDatabase();
  expect(wiring.disconnect).toHaveBeenCalledTimes(2);
});
