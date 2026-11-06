import { z } from "zod";
import {
  MoneyHistoryQuerySchema,
  MoneyHistoryEventSchema,
  MoneyHistorySequenceSchema,
} from "@sammlerraum/contracts/personal-money";
import {
  LegacyMoneySubjectSchema,
  LegacyMoneyIdSchema,
  legacyMoneyFail,
  type MoneySubject,
} from "@sammlerraum/contracts/legacy-money";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchReadTransaction } from "../search/search-read";
import { readCursorJson } from "../search/cursor-json";
import { encodeMoneyAssertionToken } from "./legacy-money-tokens";
const cursorSchema = z
  .object({
    v: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    sequence: MoneyHistorySequenceSchema,
    id: LegacyMoneyIdSchema,
  })
  .strict();
const encode = (value: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const instant = (value: unknown) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return new Date(value).toISOString();
};
export async function readPersonalMoneyHistory(
  tx: SearchReadTransaction,
  input: MoneySubject,
  user: string,
  query: unknown,
) {
  const parsedSubject = LegacyMoneySubjectSchema.safeParse(input);
  if (!parsedSubject.success || parsedSubject.data.family === "CATALOG")
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const subject = parsedSubject.data;
  const custom = subject.family === "CUSTOM";
  const parent = Prisma.sql`SELECT i.id FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" ${custom ? Prisma.sql`JOIN "CustomFieldDefinition" d ON d.id=${subject.fieldDefinitionId}::uuid AND d."collectionId"=i."collectionId" AND d.type='MONEY'` : Prisma.empty} WHERE i.id=${subject.itemId}::uuid AND i."ownerId"=${user} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`;
  const owned = await tx.$queryRaw<Array<{ id: string }>>(parent);
  if (owned.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
  const q = MoneyHistoryQuerySchema.safeParse(query);
  if (!q.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  let after: z.infer<typeof cursorSchema> | null = null;
  if (q.data.cursor) {
    try {
      after = cursorSchema.parse(readCursorJson(q.data.cursor));
      if (
        encode(after) !== q.data.cursor ||
        JSON.stringify(after.subject) !== JSON.stringify(subject)
      )
        throw Error();
    } catch {
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    }
  }
  const table = Prisma.raw(
    custom ? '"CustomMoneyInterpretationEvent"' : '"PurchaseMoneyInterpretationEvent"',
  );
  const rows = await tx.$queryRaw<
    Array<{ value: Record<string, unknown> | null; revocationId: string | null }>
  >(Prisma.sql`
 WITH owned AS (${parent}) SELECT h.value,h."revocationId" FROM owned
 LEFT JOIN LATERAL(SELECT to_jsonb(e)||jsonb_build_object('sequence',e.sequence::text,'rawAmountMinor',e."rawAmountMinor"::text) AS value,r.id::text AS "revocationId"
 FROM ${table} e LEFT JOIN ${table} r ON r."revokedAssertionId"=e.id
 WHERE e."itemId"=owned.id ${custom ? Prisma.sql`AND e."fieldDefinitionId"=${subject.fieldDefinitionId}::uuid` : Prisma.empty}
 ${after ? Prisma.sql`AND (e.sequence,e.id)<(${after.sequence}::bigint,${after.id}::uuid)` : Prisma.empty}
 ORDER BY e.sequence DESC,e.id DESC LIMIT ${q.data.limit + 1}) h ON true`);
  if (rows.length === 0) return legacyMoneyFail("MONEY_NOT_FOUND");
  const all = rows
    .filter((r) => r.value !== null)
    .map((r) => {
      const v = r.value!;
      const erased = v.evidenceErasedAt === null ? null : instant(v.evidenceErasedAt);
      const assertion = v.operation === "AUTHOR" || v.operation === "CLASSIFY";
      const result = MoneyHistoryEventSchema.safeParse({
        ...v,
        raw:
          v.rawAmountMinor === null && v.rawCurrency === null
            ? null
            : { amountMinor: v.rawAmountMinor, currency: v.rawCurrency },
        createdAt: instant(v.createdAt),
        evidenceErasedAt: erased,
        expectedAssertionToken: assertion
          ? encodeMoneyAssertionToken({
              v: 1,
              subject,
              assertionId: v.id,
              evidenceErasedAt: erased,
              revocationId: r.revocationId,
            })
          : null,
      });
      if (!result.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
      return result.data;
    });
  const events = all.slice(0, q.data.limit),
    last = events.at(-1);
  const result = {
    schemaVersion: 1 as const,
    subject,
    events,
    nextCursor:
      all.length > q.data.limit && last
        ? encode({ v: 1, subject, sequence: last.sequence, id: last.id })
        : null,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024)
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return result;
}
