import { StripeBillingProvider } from "@sammlerraum/billing/stripe-provider";
import { createBillingWebhookService } from "@sammlerraum/domain/billing/webhook-service";
import { createExternalSpendGate } from "@sammlerraum/domain/billing/external-spend-gate";
import {
  createBillingDispatcher,
  createBillingSyncJob,
  BILLING_SYNC_JOB,
} from "./jobs/billing-sync";
import { OpenAICollectibleProvider } from "@sammlerraum/ai/openai-provider";
import { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
import { createAnalyzeItemJob, AI_ANALYZE_ITEM_JOB } from "./jobs/analyze-item";
import { createAIAnalysisDispatcher } from "./jobs/ai-analysis-dispatcher";
import { createSmtpProvider } from "@sammlerraum/email/smtp-provider";
import { createSendEmailJob, NOTIFICATION_EMAIL_JOB } from "./jobs/send-email";
import { createNotificationEmailRepository } from "./jobs/notification-email-repository";
import { createNotificationEmailDispatcher } from "./jobs/notification-email-dispatcher";
import { createReportService } from "@sammlerraum/domain/reports/report-service";
import { createPrismaReportRepository } from "./jobs/insurance-report-repository";
import { createInsuranceReportJob, INSURANCE_REPORT_JOB } from "./jobs/insurance-report-runtime";
import { createInsuranceReportDispatcher } from "./jobs/insurance-report-dispatcher";
import { createExportService } from "@sammlerraum/domain/exports/export-service";
import { createPrismaTabularExportRepository } from "./jobs/tabular-export-repository";
import { createTabularExportJob, TABULAR_EXPORT_JOB } from "./jobs/tabular-export-runtime";
import { createTabularExportDispatcher } from "./jobs/tabular-export-dispatcher";
import { createImportCommitService } from "@sammlerraum/domain/imports/import-commit-service";
import { createImportCommitter, IMPORT_COMMIT_JOB } from "./jobs/commit-import";
import { createPrismaImportParserRepository } from "./jobs/import-parser-repository";
import { createImportDispatcher } from "./jobs/import-dispatcher";
import { createImportParser, IMPORT_PARSE_JOB } from "./jobs/import-parser-runtime";
import { createProductionMarketProviders } from "./jobs/market-provider-composition";
import { composeMarketSync } from "./jobs/market-sync-runtime";
import { createImportSourceCleanup } from "./jobs/import-source-cleanup";
import { createPrivateArtifactExpiry } from "./jobs/private-artifact-expiry";
import type { StorageCleanupCursor } from "@sammlerraum/storage";
import { createMediaCleanupService } from "@sammlerraum/domain/media/cleanup-service";
import { createMediaCleanupJob } from "./jobs/cleanup-media";
import { runWorkerMain } from "./main";
import { createImageDispatcher } from "./jobs/image-dispatcher";
import { createPrismaImageRepository } from "./jobs/image-repository";
import { createImageProcessor, IMAGE_JOB } from "./jobs/process-image";

async function startProductionWorker(): Promise<void> {
  const [
    { serverEnv, parseNotificationEmailEnv, parseBillingProviderEnv },
    { prisma },
    { checkDatabaseHealth },
    { createPgBossServices },
    { LocalPersistentStorage, cleanupLocalStorageTemporaryFiles },
    { createMediaAssetLocker },
    worker,
  ] = await Promise.all([
    import("@sammlerraum/config/server"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/db/health"),
    import("@sammlerraum/queue"),
    import("@sammlerraum/storage"),
    import("@sammlerraum/db/media-lock"),
    import("./main"),
  ]);
  const notificationSmtp = parseNotificationEmailEnv(process.env);
  const { runtime, client, registry, producerBackend } = createPgBossServices(
    serverEnv.DATABASE_URL,
  );
  const { createPrismaClient } = await import("@sammlerraum/db/create-client");
  const marketDatabase = createPrismaClient(serverEnv.DATABASE_URL, { bounded: true });
  const providers = createProductionMarketProviders({
    config: serverEnv,
    database: marketDatabase,
  });
  const marketSync = composeMarketSync({
    ...providers,
    database: marketDatabase,
    backend: producerBackend,
    workers: registry,
    enabled: serverEnv.MARKET_SYNC_ENABLED,
    intervalMs: serverEnv.MARKET_SYNC_INTERVAL_MS,
    batchSize: serverEnv.MARKET_SYNC_BATCH_SIZE,
    maxPending: serverEnv.MARKET_SYNC_MAX_PENDING,
    logger: console,
  });
  const repository = createPrismaImageRepository(prisma);
  const withAssetLock = createMediaAssetLocker(serverEnv.DATABASE_URL);
  const storage = new LocalPersistentStorage(serverEnv.UPLOADS_DIR, withAssetLock);
  const stagingCursor: StorageCleanupCursor = {};
  const sourceCleanup = createImportSourceCleanup(prisma, storage, withAssetLock, console);
  const artifactExpiry = createPrivateArtifactExpiry(prisma, {
    retentionHours: serverEnv.MEDIA_RETENTION_HOURS,
  });
  const mediaCleanup = createMediaCleanupJob(
    createMediaCleanupService(prisma, {
      retentionHours: serverEnv.MEDIA_RETENTION_HOURS,
      batchSize: serverEnv.MEDIA_CLEANUP_BATCH_SIZE,
    }),
    storage,
    withAssetLock,
    console,
    {
      intervalMs: serverEnv.MEDIA_CLEANUP_INTERVAL_MS,
      beforeCleanup: async () => {
        await sourceCleanup.run();
        await artifactExpiry.run();
      },
      cleanupTemporary: () =>
        cleanupLocalStorageTemporaryFiles(serverEnv.UPLOADS_DIR, {
          maxAgeHours: serverEnv.STORAGE_TEMP_MAX_AGE_HOURS,
          withLock: withAssetLock,
          cursor: stagingCursor,
          maxEntries: 1000,
        }),
    },
  );
  const processImage = createImageProcessor(repository, storage, {
    maxImageBytes: serverEnv.MEDIA_MAX_IMAGE_BYTES,
    maxDocumentBytes: serverEnv.MEDIA_MAX_DOCUMENT_BYTES,
    maxPixels: serverEnv.MEDIA_MAX_IMAGE_PIXELS,
  });
  const parseImport = createImportParser(
    createPrismaImportParserRepository(prisma),
    storage,
    {
      maxBytes: serverEnv.IMPORT_MAX_BYTES,
      maxRows: serverEnv.IMPORT_MAX_ROWS,
    },
    withAssetLock,
  );
  const reportRepository = createPrismaReportRepository(prisma);
  registry.registerCancellable(
    INSURANCE_REPORT_JOB,
    createInsuranceReportJob(
      reportRepository,
      createReportService(prisma, {
        canonicalMoneyEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED,
      }),
      storage,
      withAssetLock,
    ),
  );
  const reportDispatcher = createInsuranceReportDispatcher(reportRepository, client, console);
  const exportRepository = createPrismaTabularExportRepository(prisma);
  registry.registerCancellable(
    TABULAR_EXPORT_JOB,
    createTabularExportJob(
      exportRepository,
      createExportService(prisma, {
        canonicalMoneyEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED,
      }),
      storage,
      withAssetLock,
    ),
  );
  const exportDispatcher = createTabularExportDispatcher(exportRepository, client, console);
  registry.registerCancellable(IMPORT_PARSE_JOB, parseImport);
  registry.registerCancellable(
    IMPORT_COMMIT_JOB,
    createImportCommitter(createImportCommitService(prisma)),
  );
  // Register before queue.start locks the registry.
  registry.register(IMAGE_JOB, async ({ assetId }: { assetId: string }) => {
    if (typeof assetId !== "string") return;
    await withAssetLock(assetId, () => processImage({ assetId }));
  });
  const imageDispatcher = createImageDispatcher(repository, client, console);
  const importDispatcher = createImportDispatcher(prisma, client, console);
  let notificationDispatcher: ReturnType<typeof createNotificationEmailDispatcher> | undefined;
  if (serverEnv.NOTIFICATION_EMAIL_ENABLED && notificationSmtp) {
    const emailRepository = createNotificationEmailRepository(prisma);
    const sendEmail = createSendEmailJob(emailRepository, createSmtpProvider(notificationSmtp), {
      appOrigin: serverEnv.APP_ORIGIN,
    });
    registry.registerCancellable(NOTIFICATION_EMAIL_JOB, (payload, { signal }) =>
      sendEmail(payload, signal),
    );
    notificationDispatcher = createNotificationEmailDispatcher(emailRepository, client, console);
  }
  let aiDispatcher: ReturnType<typeof createAIAnalysisDispatcher> | undefined;
  if (serverEnv.AI_ANALYSIS_ENABLED) {
    // Server config has already required an explicit model, key and positive admission budget.
    if (!serverEnv.AI_OPENAI_API_KEY || !serverEnv.AI_OPENAI_MODEL)
      throw new Error("Analysis configuration unavailable");
    const provider = new OpenAICollectibleProvider({
      apiKey: serverEnv.AI_OPENAI_API_KEY,
      model: serverEnv.AI_OPENAI_MODEL,
    });
    const service = createAIAnalysisService(marketDatabase, {
      providerId: provider.id,
      model: provider.model,
      monthlyRequestLimit: serverEnv.AI_MONTHLY_REQUEST_LIMIT,
    });
    const spendGate = createExternalSpendGate(marketDatabase, {
      providerId: provider.id,
      monthlyLimitCents: serverEnv.EXTERNAL_MONTHLY_BUDGET_EUR_CENTS,
      fixedMonthlyCostCents: serverEnv.EXTERNAL_FIXED_MONTHLY_EUR_CENTS,
      callReservationCents: serverEnv.AI_CALL_RESERVATION_EUR_CENTS,
    });
    registry.registerCancellable(
      AI_ANALYZE_ITEM_JOB,
      createAnalyzeItemJob(service, provider, storage, {
        reserveExternalCall: (callId) => spendGate.reserve(callId),
      }),
    );
    aiDispatcher = createAIAnalysisDispatcher(service, client, console);
  }
  let billingDispatcher: ReturnType<typeof createBillingDispatcher> | undefined;
  const billingConfig = parseBillingProviderEnv(process.env);
  if (billingConfig) {
    const provider = new StripeBillingProvider(billingConfig);
    const service = createBillingWebhookService(marketDatabase, {
      providerId: provider.id,
      liveMode: billingConfig.liveMode,
    });
    registry.registerCancellable(BILLING_SYNC_JOB, createBillingSyncJob(service, provider));
    billingDispatcher = createBillingDispatcher(service, client, console);
  }
  await worker.startWorker({
    queue: runtime,
    imageDispatcher,
    exportDispatcher,
    reportDispatcher,
    ...(notificationDispatcher ? { notificationDispatcher } : {}),
    ...(aiDispatcher ? { aiDispatcher } : {}),
    ...(billingDispatcher ? { billingDispatcher } : {}),
    importDispatcher,
    mediaCleanup,
    marketSync,
    databaseHealth: () => checkDatabaseHealth(prisma),
    disconnectDatabase: async () => {
      await Promise.all([marketDatabase.$disconnect(), prisma.$disconnect()]);
    },
    healthPort: serverEnv.WORKER_HEALTH_PORT,
    logger: console,
  });
}

void runWorkerMain(startProductionWorker).then((exitCode) => {
  process.exitCode = exitCode;
});
