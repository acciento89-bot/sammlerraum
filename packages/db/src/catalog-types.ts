import type { CatalogProposal, Prisma, PrismaClient } from "@prisma/client";

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

export type CatalogProposalTransaction = CatalogTransaction &
  Pick<
    Prisma.TransactionClient,
    "catalogProposal" | "applicationRoleGrant" | "catalogRollbackAudit"
  >;
export type CatalogProposalDatabase = Pick<PrismaClient, "$transaction">;

export type CatalogProposalRecord = CatalogProposal;
