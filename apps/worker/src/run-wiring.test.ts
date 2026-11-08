import { expect, it, vi } from "vitest";
const wiring = vi.hoisted(() => ({
  startWorker: vi.fn(async (_options: unknown) => {}),
  emailEnabled: false,
  aiEnabled: false,
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
  parseNotificationEmailEnv: () =>
    wiring.emailEnabled
      ? {
          APP_ORIGIN: "https://example.invalid",
          SMTP_HOST: "smtp.example.invalid",
          SMTP_PORT: 587,
          SMTP_SECURE: false,
          SMTP_USER: "owned-smtp-user",
          SMTP_PASSWORD: "owned-smtp-secret",
          SMTP_FROM: "Sammlerraum <notice@example.invalid>",
        }
      : null,
  serverEnv: {
    APP_ORIGIN: "https://example.invalid",
    get AI_ANALYSIS_ENABLED() {
      return wiring.aiEnabled;
    },
    AI_OPENAI_API_KEY: "fixture-not-a-real-key",
    AI_OPENAI_MODEL: "fixture-vision",
    AI_MONTHLY_REQUEST_LIMIT: 10,
    get NOTIFICATION_EMAIL_ENABLED() {
      return wiring.emailEnabled;
    },
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
  expect(wiring.registerCancellable).toHaveBeenCalledWith(
    "imports.parse-source",
    expect.any(Function),
  );
  expect(wiring.registerCancellable).toHaveBeenCalledWith("imports.commit", expect.any(Function));
  expect(wiring.registerCancellable).toHaveBeenCalledWith(
    "exports.build-tabular",
    expect.any(Function),
  );
  expect(wiring.registerCancellable).toHaveBeenCalledWith(
    "reports.build-insurance",
    expect.any(Function),
  );
  const options = wiring.startWorker.mock.calls[0]![0] as unknown as {
    marketSync: { start(): void; stop(): Promise<void> };
    disconnectDatabase(): Promise<void>;
  };
  expect(options).not.toHaveProperty("notificationDispatcher");
  expect(options).not.toHaveProperty("aiDispatcher");
  expect(wiring.registerCancellable).not.toHaveBeenCalledWith(
    "ai.analyze-item",
    expect.any(Function),
  );
  expect(wiring.registerCancellable).not.toHaveBeenCalledWith(
    "notification.send-email",
    expect.any(Function),
  );
  expect(options.marketSync).toEqual({ start: expect.any(Function), stop: expect.any(Function) });
  options.marketSync.start();
  await options.marketSync.stop();
  await options.disconnectDatabase();
  expect(wiring.disconnect).toHaveBeenCalledTimes(2);
});

it("composes the notification worker only after explicit email activation", async () => {
  vi.resetModules();
  wiring.startWorker.mockClear();
  wiring.register.mockClear();
  wiring.registerCancellable.mockClear();
  wiring.emailEnabled = true;
  try {
    await import("./run");
    await vi.waitFor(() => expect(wiring.startWorker).toHaveBeenCalledOnce());
    expect(wiring.registerCancellable).toHaveBeenCalledWith(
      "notification.send-email",
      expect.any(Function),
    );
    const options = wiring.startWorker.mock.calls[0]![0] as {
      notificationDispatcher: { start(): void; stop(): Promise<void> };
    };
    expect(options.notificationDispatcher).toEqual(
      expect.objectContaining({ start: expect.any(Function), stop: expect.any(Function) }),
    );
    await options.notificationDispatcher.stop();
  } finally {
    wiring.emailEnabled = false;
  }
});

it("registers the advisory photo worker only after explicit AI activation", async () => {
  vi.resetModules();
  wiring.startWorker.mockClear();
  wiring.register.mockClear();
  wiring.registerCancellable.mockClear();
  wiring.aiEnabled = true;
  try {
    await import("./run");
    await vi.waitFor(() => expect(wiring.startWorker).toHaveBeenCalledOnce());
    expect(wiring.registerCancellable).toHaveBeenCalledWith(
      "ai.analyze-item",
      expect.any(Function),
    );
    const options = wiring.startWorker.mock.calls[0]![0] as {
      aiDispatcher: { start(): void; stop(): Promise<void> };
    };
    expect(options.aiDispatcher).toEqual(
      expect.objectContaining({ start: expect.any(Function), stop: expect.any(Function) }),
    );
    await options.aiDispatcher.stop();
  } finally {
    wiring.aiEnabled = false;
  }
});
