import type { Prisma, PrismaClient } from "@prisma/client";

// Narrow client seam: callers can use an enclosing proposal-approval transaction.
export type CatalogTransaction = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "catalogEntry"
  | "catalogVariant"
  | "catalogExternalIdentifier"
  | "catalogAttributeValue"
  | "catalogRevision"
  | "categoryTemplate"
  | "catalogAttributeDefinition"
>;
export type CatalogDatabase = Pick<PrismaClient, "$transaction" | "catalogRevision">;
export type CatalogJson = Prisma.InputJsonValue;
