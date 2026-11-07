import type { PrismaClient } from "@prisma/client";
import { createPrismaPrivateArtifactRepository } from "./private-artifact-repository";
export const createPrismaReportRepository = (database: PrismaClient) =>
  createPrismaPrivateArtifactRepository(database, "REPORT");
