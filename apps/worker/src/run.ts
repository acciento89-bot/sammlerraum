import { runWorkerMain } from "./main";

async function startProductionWorker(): Promise<void> {
  const [{ serverEnv }, { prisma }, { checkDatabaseHealth }, { createPgBossServices }, worker] =
    await Promise.all([
      import("@sammlerraum/config/server"),
      import("@sammlerraum/db/client"),
      import("@sammlerraum/db/health"),
      import("@sammlerraum/queue"),
      import("./main"),
    ]);
  const { runtime } = createPgBossServices(serverEnv.DATABASE_URL);
  await worker.startWorker({
    queue: runtime,
    databaseHealth: () => checkDatabaseHealth(prisma),
    disconnectDatabase: () => prisma.$disconnect(),
    healthPort: serverEnv.WORKER_HEALTH_PORT,
    logger: console,
  });
}

void runWorkerMain(startProductionWorker).then((exitCode) => {
  process.exitCode = exitCode;
});
