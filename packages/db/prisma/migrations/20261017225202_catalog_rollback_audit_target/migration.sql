-- AlterTable
ALTER TABLE "CatalogRollbackAudit" ADD COLUMN     "expectedRevision" INTEGER NOT NULL,
ADD COLUMN     "targetRevision" INTEGER NOT NULL;

