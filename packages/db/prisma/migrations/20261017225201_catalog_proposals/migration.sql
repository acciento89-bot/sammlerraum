-- CreateEnum
CREATE TYPE "ApplicationRole" AS ENUM ('MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CatalogProposalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT');

-- CreateTable
CREATE TABLE "ApplicationRoleGrant" (
    "userId" TEXT NOT NULL,
    "role" "ApplicationRole" NOT NULL,
    "grantedBy" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationRoleGrant_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CatalogProposal" (
    "id" UUID NOT NULL,
    "proposerId" TEXT NOT NULL,
    "targetEntryId" UUID,
    "baseRevision" INTEGER,
    "patch" JSONB NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "source" JSONB,
    "state" "CatalogProposalState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatorId" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "decisionReason" VARCHAR(1000),
    "resultEntryId" UUID,
    "resultRevision" INTEGER,

    CONSTRAINT "CatalogProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogRollbackAudit" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogRollbackAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProposal_proposerId_state_idx" ON "CatalogProposal"("proposerId", "state");

-- CreateIndex
CREATE INDEX "CatalogProposal_proposerId_createdAt_id_idx" ON "CatalogProposal"("proposerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CatalogProposal_state_createdAt_id_idx" ON "CatalogProposal"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CatalogRollbackAudit_entryId_revision_idx" ON "CatalogRollbackAudit"("entryId", "revision");

-- AddForeignKey
ALTER TABLE "ApplicationRoleGrant" ADD CONSTRAINT "ApplicationRoleGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProposal" ADD CONSTRAINT "CatalogProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProposal" ADD CONSTRAINT "CatalogProposal_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProposal" ADD CONSTRAINT "CatalogProposal_targetEntryId_fkey" FOREIGN KEY ("targetEntryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProposal" ADD CONSTRAINT "CatalogProposal_resultEntryId_resultRevision_fkey" FOREIGN KEY ("resultEntryId", "resultRevision") REFERENCES "CatalogRevision"("entryId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRollbackAudit" ADD CONSTRAINT "CatalogRollbackAudit_entryId_revision_fkey" FOREIGN KEY ("entryId", "revision") REFERENCES "CatalogRevision"("entryId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRollbackAudit" ADD CONSTRAINT "CatalogRollbackAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

