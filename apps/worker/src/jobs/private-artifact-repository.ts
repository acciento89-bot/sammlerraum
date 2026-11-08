import { communityEventHandlers } from "../../../../packages/domain/src/notifications/community-event-handlers";
import { lockCommunityParticipants } from "../../../../packages/domain/src/community/social-scope";
import { ReportError } from "@sammlerraum/contracts/reports";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma as PrismaTypes } from "@prisma/client";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  runSearchTransaction,
  type SearchReadTransaction,
  type BoundedSearchReadTransaction,
} from "../../../../packages/domain/src/search/search-read";
import { ExportError, EXPORT_MAX_BYTES } from "@sammlerraum/contracts/exports";
export type ArtifactClaim = {
  id: string;
  ownerId: string;
  token: string;
  assetId: string;
  storageKey: string;
  format: "CSV" | "XLSX" | "PDF";
  locale: "de" | "en";
  request: unknown;
  sourceJson: string | null;
  sourceHash: string | null;
};
export interface PrivateArtifactRepository {
  claim(id: string): Promise<ArtifactClaim | null>;
  active(claim: ArtifactClaim): Promise<boolean>;
  renew(claim: ArtifactClaim): Promise<boolean>;
  storeSource(claim: ArtifactClaim, json: string, hash: string, asOf: string): Promise<boolean>;
  ready(
    claim: ArtifactClaim,
    data: { byteSize: number; checksumSha256: string; mimeType: string },
    verify: (tx: BoundedSearchReadTransaction) => Promise<void>,
  ): Promise<boolean>;
  fail(claim: ArtifactClaim, code: string, retry: boolean): Promise<boolean>;
  dispatchCandidates(limit: number): Promise<string[]>;
  noteDispatched(id: string): Promise<void>;
}
type Job = {
  id: string;
  ownerId: string;
  format: "CSV" | "XLSX" | "PDF";
  locale: "de" | "en";
  request: unknown;
  status: string;
  processingToken: string | null;
  processingAttempts: number;
  sourceJson: string | null;
  sourceHash: string | null;
  artifactId: string | null;
  active: boolean;
  unexpired: boolean;
};
const mime = (format: "CSV" | "XLSX" | "PDF") =>
  format === "PDF"
    ? "application/pdf"
    : format === "CSV"
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
async function lockJob(tx: SearchReadTransaction, id: string, table: PrismaTypes.Sql) {
  return (
    await tx.$queryRaw<Job[]>(
      Prisma.sql`SELECT j.*,(j."processingLeaseUntil">clock_timestamp()) AS active,(j."expiresAt">clock_timestamp()) AS unexpired FROM ${table} j WHERE id=${id}::uuid FOR UPDATE`,
    )
  )[0];
}
function current(job: Job | undefined, claim: ArtifactClaim) {
  return (
    !!job &&
    job.ownerId === claim.ownerId &&
    job.status === "BUILDING" &&
    job.processingToken === claim.token &&
    job.artifactId === claim.assetId &&
    job.active &&
    job.unexpired
  );
}
export function createPrismaPrivateArtifactRepository(
  database: PrismaClient,
  kind: "TABULAR" | "REPORT",
): PrivateArtifactRepository {
  if (kind !== "TABULAR" && kind !== "REPORT") throw new Error("Invalid internal artifact kind");
  const table = Prisma.raw(kind === "TABULAR" ? '"ExportJob"' : '"ReportJob"');
  const errorPrefix = kind === "TABULAR" ? "EXPORT" : "REPORT";
  const integrity = () =>
    kind === "TABULAR" ? new ExportError("EXPORT_INTEGRITY") : new ReportError("REPORT_INTEGRITY");
  const run = <T>(work: (tx: PrismaTypes.TransactionClient) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        return work(tx);
      },
      { maxWait: 5000, timeout: 10000 },
    );
  return {
    async claim(id) {
      return run(async (tx) => {
        const job = await lockJob(tx, id, table);
        if (!job || !["PENDING", "BUILDING"].includes(job.status) || job.active) return null;
        if (!job.unexpired || job.processingAttempts >= 5) {
          await tx.$queryRaw`UPDATE ${table} SET status='FAILED',"errorCode"=${!job.unexpired ? `${errorPrefix}_EXPIRED` : `${errorPrefix}_ATTEMPTS_EXHAUSTED`},"processingToken"=NULL,"processingLeaseUntil"=NULL,revision=revision+1,"updatedAt"=now() WHERE id=${id}::uuid RETURNING id`;
          return null;
        }
        const token = randomUUID(),
          assetId = randomUUID(),
          key = `${kind === "TABULAR" ? "exports" : "reports"}/${job.id}/${token}/data.${job.format.toLowerCase()}`;
        await tx.$queryRaw`INSERT INTO "MediaAsset" ("generatedArtifact",id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","processingToken","processingLeaseUntil","processingAttempts","updatedAt") VALUES (true,${assetId}::uuid,${job.ownerId},'DOCUMENT','PROCESSING',${key},${mime(job.format)},0,${"0".repeat(64)},${`sammlerraum-${job.id}.${job.format.toLowerCase()}`},${token}::uuid,now()+interval '90 seconds',1,now()) RETURNING id`;
        await tx.$queryRaw`UPDATE ${table} SET status='BUILDING',"artifactId"=${assetId}::uuid,"processingToken"=${token}::uuid,"processingLeaseUntil"=now()+interval '90 seconds',"processingAttempts"="processingAttempts"+1,"errorCode"=NULL,revision=revision+1,"updatedAt"=now() WHERE id=${job.id}::uuid RETURNING id`;
        return {
          id: job.id,
          ownerId: job.ownerId,
          token,
          assetId,
          storageKey: key,
          format: job.format,
          locale: job.locale,
          request: job.request,
          sourceJson: job.sourceJson,
          sourceHash: job.sourceHash,
        };
      });
    },
    async active(claim) {
      return run(async (tx) => {
        const job = await lockJob(tx, claim.id, table);
        if (!current(job, claim)) return false;
        const [asset] = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "MediaAsset" WHERE id=${claim.assetId}::uuid AND "ownerId"=${claim.ownerId} AND "processingToken"=${claim.token}::uuid AND status='PROCESSING' AND "cleanupStartedAt" IS NULL FOR UPDATE`;
        return !!asset;
      });
    },
    async renew(claim) {
      return run(async (tx) => {
        const job = await lockJob(tx, claim.id, table);
        if (!current(job, claim)) return false;
        await tx.$queryRaw`UPDATE ${table} SET "processingLeaseUntil"=now()+interval '90 seconds' WHERE id=${claim.id}::uuid RETURNING id`;
        const assets = await tx.$queryRaw<
          { id: string }[]
        >`UPDATE "MediaAsset" SET "processingLeaseUntil"=now()+interval '90 seconds' WHERE id=${claim.assetId}::uuid AND "ownerId"=${claim.ownerId} AND "processingToken"=${claim.token}::uuid AND status='PROCESSING' AND "cleanupStartedAt" IS NULL RETURNING id`;
        if (assets.length !== 1) throw integrity();
        return true;
      });
    },
    async storeSource(claim, json, hash, asOf) {
      if (Buffer.byteLength(json) > 8388608 || !/^[0-9a-f]{64}$/u.test(hash)) throw integrity();
      return run(async (tx) => {
        const job = await lockJob(tx, claim.id, table);
        if (!current(job, claim)) return false;
        if (job!.sourceJson !== null) {
          if (job!.sourceJson !== json || job!.sourceHash !== hash) throw integrity();
          return true;
        }
        await tx.$queryRaw`UPDATE ${table} SET "sourceJson"=${json},"sourceHash"=${hash},"sourceAt"=${new Date(asOf)},revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid RETURNING id`;
        return true;
      });
    },
    async ready(claim, data, verify) {
      if (
        !Number.isInteger(data.byteSize) ||
        data.byteSize < 1 ||
        data.byteSize > EXPORT_MAX_BYTES ||
        !/^[0-9a-f]{64}$/u.test(data.checksumSha256) ||
        data.mimeType !== mime(claim.format)
      )
        throw integrity();
      return runSearchTransaction(database, async (tx) => {
        await lockCommunityParticipants(tx, [claim.ownerId]);
        const job = await lockJob(tx, claim.id, table);
        if (!current(job, claim) || job!.sourceJson === null) return false;
        const [asset] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "MediaAsset" WHERE id=${claim.assetId}::uuid AND "ownerId"=${claim.ownerId} AND "processingToken"=${claim.token}::uuid AND "storageKey"=${claim.storageKey} AND status='PROCESSING' AND "cleanupStartedAt" IS NULL FOR UPDATE`,
        );
        if (!asset) return false;
        await verify(tx);
        tx.checkBudget();
        const changed = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE ${table} SET status='READY',"processingToken"=NULL,"processingLeaseUntil"=NULL,revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${claim.id}::uuid AND "processingToken"=${claim.token}::uuid AND "processingLeaseUntil">clock_timestamp() AND "expiresAt">clock_timestamp() RETURNING id`,
        );
        if (changed.length !== 1) return false;
        const assets = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "MediaAsset" SET status='READY',"byteSize"=${BigInt(data.byteSize)},"checksumSha256"=${data.checksumSha256},"processingToken"=NULL,"processingLeaseUntil"=NULL,"processingErrorCode"=NULL,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${claim.assetId}::uuid AND "ownerId"=${claim.ownerId} AND "processingToken"=${claim.token}::uuid AND "cleanupStartedAt" IS NULL RETURNING id`,
        );
        if (assets.length !== 1) throw integrity();
        if (kind === "TABULAR")
          await communityEventHandlers(tx).onJobCompleted({
            id: claim.id,
            recipientId: claim.ownerId,
            kind: "EXPORT",
          });
        return true;
      });
    },
    async fail(claim, code, retry) {
      const safe = /^(?:EXPORT|REPORT)_[A-Z_]{1,24}$/u.test(code)
        ? code
        : `${errorPrefix}_BUILD_FAILED`;
      return run(async (tx) => {
        const job = await lockJob(tx, claim.id, table);
        await tx.$queryRaw`UPDATE "MediaAsset" SET status='FAILED',"processingToken"=NULL,"processingLeaseUntil"=NULL,"processingErrorCode"=${safe},"updatedAt"=now() WHERE id=${claim.assetId}::uuid AND "ownerId"=${claim.ownerId} AND "processingToken"=${claim.token}::uuid AND status='PROCESSING' AND "cleanupStartedAt" IS NULL RETURNING id`;
        if (!current(job, claim)) return false;
        await tx.$queryRaw`UPDATE ${table} SET status=${retry ? "PENDING" : "FAILED"}::"ExportJobStatus","processingToken"=NULL,"processingLeaseUntil"=NULL,"errorCode"=${safe},revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid RETURNING id`;
        return true;
      });
    },
    async dispatchCandidates(limit) {
      const count = Math.min(Math.max(Number.isInteger(limit) ? limit : 1, 1), 32);
      const rows = await database.$queryRaw<
        { id: string }[]
      >`SELECT id FROM ${table} WHERE "expiresAt">timezone('UTC',clock_timestamp()) AND (status='PENDING' OR (status='BUILDING' AND "processingLeaseUntil"<timezone('UTC',clock_timestamp()))) AND ("lastDispatchedAt" IS NULL OR "lastDispatchedAt"<timezone('UTC',clock_timestamp())-interval '30 seconds') ORDER BY "createdAt",id LIMIT ${count}`;
      return rows.map((r) => r.id);
    },
    async noteDispatched(id) {
      await database.$queryRaw`UPDATE ${table} SET "lastDispatchedAt"=timezone('UTC',now()) WHERE id=${id}::uuid AND status IN ('PENDING','BUILDING') RETURNING id`;
    },
  };
}
