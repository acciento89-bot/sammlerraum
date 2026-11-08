import { z } from "zod";
import type { CatalogProposalTransaction } from "@sammlerraum/db/catalog-types";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  CatalogMoneySubjectSchema,
  CatalogMoneyScopeSchema,
  CatalogMoneyPathSchema,
  ClassifyCatalogMoneyInputSchema,
  RevokeCatalogMoneyInputSchema,
  CatalogMoneyHistoryEventSchema,
} from "@sammlerraum/contracts/catalog-money";
import {
  MoneyHistoryQuerySchema,
  MoneyHistorySequenceSchema,
} from "@sammlerraum/contracts/personal-money";
import {
  LegacyMoneyIdSchema,
  LegacyMoneyError,
  legacyMoneyFail,
} from "@sammlerraum/contracts/legacy-money";
import {
  readCatalogMoneyMap,
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
  revokeMoneyAssertion,
} from "../money/legacy-money-store";
import { moneyTransaction } from "../money/legacy-money-transaction";
import { encodeMoneyAssertionToken } from "../money/legacy-money-tokens";
import { ApplicationRoleError, requireApplicationModerator } from "../authz/application-role";
import { readCursorJson } from "../search/cursor-json";
import type { SearchReadTransaction } from "../search/search-read";
import { isReadSerializationFailure, isReadDependencyFailure } from "../api/read-dependency-errors";
export type CatalogMoneyDatabase = {
  $transaction<T>(
    work: (tx: CatalogProposalTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return parsed.data;
}
const cursorSchema = z
  .object({
    v: z.literal(1),
    subject: CatalogMoneySubjectSchema,
    sequence: MoneyHistorySequenceSchema,
    id: LegacyMoneyIdSchema,
  })
  .strict();
const encode = (value: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function instant(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return new Date(value).toISOString();
}
export function createCatalogMoneyService(database: CatalogMoneyDatabase, actorId: string) {
  const who = { userId: actorId };
  async function run<T>(
    work: (tx: CatalogProposalTransaction, money: SearchReadTransaction) => Promise<T>,
  ): Promise<T> {
    const stop = performance.now() + 12000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = Math.floor(stop - performance.now());
      if (remaining < 1) return legacyMoneyFail("MONEY_UNAVAILABLE");
      try {
        const saved = await database.$transaction(
          async (tx) => {
            const timeout = Math.min(5000, remaining);
            await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout',${`${timeout}ms`},true)`;
            const result = await work(tx, moneyTransaction(tx));
            if (performance.now() >= stop) return legacyMoneyFail("MONEY_UNAVAILABLE");
            return result;
          },
          {
            isolationLevel: "ReadCommitted",
            maxWait: Math.min(2000, remaining),
            timeout: Math.min(5000, remaining),
          },
        );
        if (performance.now() >= stop) return legacyMoneyFail("MONEY_UNAVAILABLE");
        return saved;
      } catch (error) {
        if (error instanceof LegacyMoneyError) throw error;
        if (isReadSerializationFailure(error) && attempt < 2 && performance.now() < stop) continue;
        if (isReadDependencyFailure(error)) return legacyMoneyFail("MONEY_UNAVAILABLE");
        throw error;
      }
    }
    return legacyMoneyFail("MONEY_UNAVAILABLE");
  }
  async function moderator(tx: CatalogProposalTransaction) {
    try {
      await requireApplicationModerator(tx, actorId);
    } catch (error) {
      if (error instanceof ApplicationRoleError) return legacyMoneyFail("MONEY_FORBIDDEN");
      throw error;
    }
  }
  const scope = (entryId: string, revision: number) =>
    parse(CatalogMoneyScopeSchema, { entryId, revision });
  const subject = (entryId: string, revision: number, path: unknown) =>
    parse(CatalogMoneySubjectSchema, {
      family: "CATALOG",
      ...scope(entryId, revision),
      ...parse(CatalogMoneyPathSchema, path),
    });
  return {
    getRevision: (entryId: string, revision: number) =>
      run(async (_tx, money) => {
        const scoped = scope(entryId, revision);
        return {
          schemaVersion: 1 as const,
          ...scoped,
          money: await readCatalogMoneyMap(money, entryId, revision, who),
        };
      }),
    classify: (entryId: string, revision: number, input: unknown) =>
      run(async (tx, money) => {
        await moderator(tx);
        const data = parse(ClassifyCatalogMoneyInputSchema, input);
        const s = subject(entryId, revision, {
          target: data.target,
          definitionId: data.definitionId,
        });
        const fact = await requireMoneyToken(money, s, who, data.input.expectedFactToken);
        return appendMoneyAssertion(money, fact, { kind: "CLASSIFY", input: data.input });
      }),
    revoke: (entryId: string, revision: number, input: unknown) =>
      run(async (tx, money) => {
        await moderator(tx);
        const data = parse(RevokeCatalogMoneyInputSchema, input);
        const s = subject(entryId, revision, {
          target: data.target,
          definitionId: data.definitionId,
        });
        await revokeMoneyAssertion(money, s, data.input, who);
        return readMoneyFact(money, s, who);
      }),
    listHistory: (entryId: string, revision: number, path: unknown, query: unknown = {}) =>
      run(async (tx, money) => {
        // Hold authoritative global access before parsing any private cursor or token.
        await moderator(tx);
        const s = subject(entryId, revision, path);
        await readMoneyFact(money, s, who);
        const q = parse(MoneyHistoryQuerySchema, query);
        let after: z.infer<typeof cursorSchema> | null = null;
        if (q.cursor) {
          try {
            after = cursorSchema.parse(readCursorJson(q.cursor));
            if (encode(after) !== q.cursor || JSON.stringify(after.subject) !== JSON.stringify(s))
              throw Error();
          } catch {
            return legacyMoneyFail("LEGACY_MONEY_INVALID");
          }
        }
        const rows = await money.$queryRaw<
          Array<{ value: Record<string, unknown>; revocationId: string | null; origin: unknown }>
        >(Prisma.sql`
        SELECT to_jsonb(e)||jsonb_build_object('sequence',e.sequence::text,'rawAmountMinor',e."rawAmountMinor"::text) AS value,
        r.id::text AS "revocationId", CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
          'family','CATALOG','entryId',o."entryId",'revision',o.revision,'definitionId',o."definitionId",'target',
          CASE WHEN o."variantId" IS NULL THEN jsonb_build_object('kind','ENTRY') ELSE jsonb_build_object('kind','VARIANT','variantId',o."variantId") END) END AS origin
        FROM "CatalogMoneyInterpretationEvent" e
        LEFT JOIN "CatalogMoneyInterpretationEvent" r ON r."revokedAssertionId"=e.id
        LEFT JOIN "CatalogMoneyInterpretationEvent" o ON o.id=CASE WHEN e.operation IN ('AUTHOR','CLASSIFY') THEN e.id WHEN e.operation='COPY' THEN e."originEventId" ELSE e."revokedAssertionId" END
        WHERE e."entryId"=${s.entryId}::uuid AND e.revision=${s.revision} AND e."targetKey"=${s.target.kind === "ENTRY" ? "entry" : s.target.variantId} AND e."definitionId"=${s.definitionId}::uuid
        ${after ? Prisma.sql`AND (e.sequence,e.id)<(${after.sequence}::bigint,${after.id}::uuid)` : Prisma.empty}
        ORDER BY e.sequence DESC,e.id DESC LIMIT ${q.limit + 1}`);
        const all = rows.map((row) => {
          const v = row.value;
          const erased = v.evidenceErasedAt === null ? null : instant(v.evidenceErasedAt);
          const parsed = CatalogMoneyHistoryEventSchema.safeParse({
            ...v,
            raw:
              v.rawAmountMinor === null && v.rawCurrency === null
                ? null
                : { amountMinor: v.rawAmountMinor, currency: v.rawCurrency },
            createdAt: instant(v.createdAt),
            evidenceErasedAt: erased,
            originSubject: row.origin,
            revocationId: row.revocationId,
            expectedAssertionToken:
              v.operation === "AUTHOR" || v.operation === "CLASSIFY"
                ? encodeMoneyAssertionToken({
                    v: 1,
                    subject: s,
                    assertionId: v.id,
                    evidenceErasedAt: erased,
                    revocationId: row.revocationId,
                  })
                : null,
          });
          if (!parsed.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
          return parsed.data;
        });
        const events = all.slice(0, q.limit),
          last = events.at(-1);
        const result = {
          schemaVersion: 1 as const,
          subject: s,
          events,
          nextCursor:
            all.length > q.limit && last
              ? encode({ v: 1, subject: s, sequence: last.sequence, id: last.id })
              : null,
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024)
          return legacyMoneyFail("MONEY_DATA_INTEGRITY");
        return result;
      }),
  };
}
