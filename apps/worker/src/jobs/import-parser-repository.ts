import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma as PrismaTypes } from "@prisma/client";
import { Prisma } from "@sammlerraum/db/search-sql";
import { ImportRawRowSchema } from "@sammlerraum/contracts/imports";
import { ImportParseError, type ParsedImportRow } from "./parse-import";
export type ImportParserClaim = {
  id: string;
  token: string;
  sourceFormat: "CSV" | "XLSX";
  sourceStorageKey: string;
  sourceByteSize: bigint;
  sourceChecksumSha256: string;
  parserOptions: unknown;
};
export interface ImportParserRepository {
  claim(id: string): Promise<ImportParserClaim | null>;
  renew(claim: ImportParserClaim): Promise<boolean>;
  verified(claim: ImportParserClaim): Promise<boolean>;
  header(claim: ImportParserClaim, cells: (string | null)[]): Promise<void>;
  append(claim: ImportParserClaim, rows: ParsedImportRow[]): Promise<void>;
  finish(claim: ImportParserClaim, total: number): Promise<void>;
  fail(claim: ImportParserClaim, code: string, retry: boolean): Promise<void>;
}
type Job = {
  id: string;
  status: string;
  parsingToken: string | null;
  parsingAttempts: number;
  parserOptions: unknown;
  parsedRows: number;
  parsedHeader: unknown;
  sourceFormat: "CSV" | "XLSX";
  sourceStorageKey: string;
  sourceByteSize: bigint;
  sourceChecksumSha256: string;
  active: boolean;
};
function fail(code: "IMPORT_CLAIM_LOST" | "IMPORT_PARSE_INTEGRITY"): never {
  throw new ImportParseError(code);
}
export function createPrismaImportParserRepository(database: PrismaClient): ImportParserRepository {
  const transact = <T>(work: (tx: PrismaTypes.TransactionClient) => Promise<T>) =>
    database.$transaction(work, { maxWait: 5000, timeout: 10000 });
  const lock = async (tx: PrismaTypes.TransactionClient, id: string): Promise<Job | undefined> =>
    (
      await tx.$queryRaw<Job[]>(
        Prisma.sql`SELECT j.*, (j."parsingLeaseUntil">CURRENT_TIMESTAMP) AS active FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE j.id=${id}::uuid AND c."deletedAt" IS NULL FOR UPDATE OF j,c`,
      )
    )[0];
  const owned = async (tx: PrismaTypes.TransactionClient, claim: ImportParserClaim) => {
    const row = await lock(tx, claim.id);
    if (
      !row ||
      row.parsingToken !== claim.token ||
      !row.active ||
      !["AWAITING_UPLOAD", "PARSING"].includes(row.status)
    )
      fail("IMPORT_CLAIM_LOST");
    return row;
  };
  const coverage = async (tx: PrismaTypes.TransactionClient, job: Job) => {
    const [count] = await tx.$queryRaw<{ count: bigint; max: number | null; min: number | null }[]>(
      Prisma.sql`SELECT count(*) AS count,max("rowNumber") AS max,min("rowNumber") AS min FROM "ImportRow" WHERE "jobId"=${job.id}::uuid`,
    );
    if (
      !count ||
      Number(count.count) !== job.parsedRows ||
      (job.parsedRows > 0 && (count.min !== 1 || count.max !== job.parsedRows))
    )
      fail("IMPORT_PARSE_INTEGRITY");
  };
  return {
    async claim(id) {
      return transact(async (tx) => {
        const job = await lock(tx, id);
        if (
          !job ||
          !["AWAITING_UPLOAD", "PARSING"].includes(job.status) ||
          job.active ||
          !job.parserOptions
        )
          return null;
        if (job.parsingAttempts >= 5) {
          await tx.$executeRaw`UPDATE "ImportJob" SET status='FAILED',"errorCode"='IMPORT_PARSE_ATTEMPTS_EXHAUSTED',"parsingToken"=NULL,"parsingLeaseUntil"=NULL,"revision"="revision"+1,"updatedAt"=now() WHERE id=${id}::uuid`;
          return null;
        }
        const token = randomUUID();
        await tx.$executeRaw`UPDATE "ImportJob" SET "parsingToken"=${token}::uuid,"parsingLeaseUntil"=now()+interval '90 seconds',"parsingAttempts"="parsingAttempts"+1,"errorCode"=NULL,"updatedAt"=now(),revision=revision+1 WHERE id=${id}::uuid`;
        return {
          id,
          token,
          sourceFormat: job.sourceFormat,
          sourceStorageKey: job.sourceStorageKey,
          sourceByteSize: job.sourceByteSize,
          sourceChecksumSha256: job.sourceChecksumSha256,
          parserOptions: job.parserOptions,
        };
      });
    },
    async renew(claim) {
      return transact(async (tx) => {
        const row = await lock(tx, claim.id);
        if (
          !row ||
          !row.active ||
          row.parsingToken !== claim.token ||
          !["AWAITING_UPLOAD", "PARSING"].includes(row.status)
        )
          return false;
        await tx.$executeRaw`UPDATE "ImportJob" SET "parsingLeaseUntil"=now()+interval '90 seconds' WHERE id=${claim.id}::uuid`;
        return true;
      });
    },
    async verified(claim) {
      return transact(async (tx) => {
        await owned(tx, claim);
        await tx.$executeRaw`UPDATE "ImportJob" SET status='PARSING',"sourceVerifiedAt"=COALESCE("sourceVerifiedAt",now()),revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid`;
        return true;
      });
    },
    async header(claim, cells) {
      const valid = ImportRawRowSchema.parse(cells);
      await transact(async (tx) => {
        const row = await owned(tx, claim);
        if (row.status !== "PARSING") fail("IMPORT_PARSE_INTEGRITY");
        if (row.parsedHeader !== null && JSON.stringify(row.parsedHeader) !== JSON.stringify(valid))
          fail("IMPORT_PARSE_INTEGRITY");
        await tx.$executeRaw`UPDATE "ImportJob" SET "parsedHeader"=${JSON.stringify(valid)}::jsonb WHERE id=${claim.id}::uuid`;
      });
    },
    async append(claim, rows) {
      if (!rows.length || rows.length > 100) fail("IMPORT_PARSE_INTEGRITY");
      await transact(async (tx) => {
        const job = await owned(tx, claim);
        if (job.status !== "PARSING") fail("IMPORT_PARSE_INTEGRITY");
        await coverage(tx, job);
        let parsed = job.parsedRows;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          const cells = ImportRawRowSchema.safeParse(row.cells);
          if (
            !cells.success ||
            !Number.isInteger(row.rowNumber) ||
            row.rowNumber < 1 ||
            row.rowNumber > 10000 ||
            !Number.isInteger(row.sourceRowNumber) ||
            row.sourceRowNumber < 1 ||
            row.sourceRowNumber > 1048576 ||
            (i > 0 && row.rowNumber !== rows[i - 1]!.rowNumber + 1)
          )
            fail("IMPORT_PARSE_INTEGRITY");
          if (row.rowNumber <= parsed) {
            const [existing] = await tx.$queryRaw<
              { rawCells: unknown; sourceRowNumber: number | null; status: string }[]
            >`SELECT "rawCells","sourceRowNumber",status FROM "ImportRow" WHERE "jobId"=${claim.id}::uuid AND "rowNumber"=${row.rowNumber}`;
            if (
              !existing ||
              existing.status !== "PENDING" ||
              existing.sourceRowNumber !== row.sourceRowNumber ||
              JSON.stringify(existing.rawCells) !== JSON.stringify(cells.data)
            )
              fail("IMPORT_PARSE_INTEGRITY");
            continue;
          }
          if (row.rowNumber !== parsed + 1) fail("IMPORT_PARSE_INTEGRITY");
          await tx.$executeRaw`INSERT INTO "ImportRow" (id,"jobId","rowNumber","sourceRowNumber","rowKey","rawCells","updatedAt") VALUES (${randomUUID()}::uuid,${claim.id}::uuid,${row.rowNumber},${row.sourceRowNumber},${`${claim.id}:${row.rowNumber}`},${JSON.stringify(cells.data)}::jsonb,now())`;
          parsed++;
        }
        await tx.$executeRaw`UPDATE "ImportJob" SET "parsedRows"=${parsed},revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid`;
      });
    },
    async finish(claim, total) {
      if (!Number.isInteger(total) || total < 0 || total > 10000) fail("IMPORT_PARSE_INTEGRITY");
      await transact(async (tx) => {
        const job = await owned(tx, claim);
        await coverage(tx, job);
        if (job.status !== "PARSING" || job.parsedRows !== total) fail("IMPORT_PARSE_INTEGRITY");
        await tx.$executeRaw`UPDATE "ImportJob" SET status='PARSED',"totalRows"=${total},"parsingToken"=NULL,"parsingLeaseUntil"=NULL,revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid`;
      });
    },
    async fail(claim, code, retry) {
      await transact(async (tx) => {
        const row = await lock(tx, claim.id);
        if (
          !row ||
          !row.active ||
          row.parsingToken !== claim.token ||
          !["AWAITING_UPLOAD", "PARSING"].includes(row.status)
        )
          return;
        const safe = /^IMPORT_[A-Z_]{1,56}$/u.test(code) ? code : "IMPORT_SOURCE_INVALID";
        const status = retry ? "AWAITING_UPLOAD" : "FAILED";
        await tx.$executeRaw`UPDATE "ImportJob" SET status=${status}::"ImportJobStatus","errorCode"=${safe},"parsingToken"=NULL,"parsingLeaseUntil"=NULL,revision=revision+1,"updatedAt"=now() WHERE id=${claim.id}::uuid`;
      });
    },
  };
}
