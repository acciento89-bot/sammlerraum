import type { PrismaClient } from "@prisma/client";
import { createPrismaPrivateArtifactRepository } from "./private-artifact-repository";
export type {
  ArtifactClaim as ExportClaim,
  PrivateArtifactRepository as TabularExportRepository,
} from "./private-artifact-repository";
export const createPrismaTabularExportRepository = (database: PrismaClient) =>
  createPrismaPrivateArtifactRepository(database, "TABULAR");
