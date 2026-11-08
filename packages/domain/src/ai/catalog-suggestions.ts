import { Prisma } from "@sammlerraum/db/search-sql";
import type { AIReviewCatalogCandidate, CollectibleAnalysis } from "@sammlerraum/contracts/ai";
import { parseItemIdentifiers, IdentifierServiceError } from "../items/identifier-service";
import type { BoundedSearchReadTransaction } from "../search/search-read";
type Choice = Omit<AIReviewCatalogCandidate, "title">;
type Pair = { catalogEntryId: string; catalogVariantId: string | null };
/** Local exact lookup over immutable extracted evidence; no new image/model request or fabricated score. */
export async function resolveReviewCatalogCandidates(
  tx: BoundedSearchReadTransaction,
  analysis: CollectibleAnalysis,
): Promise<Choice[]> {
  const choices: Choice[] = [],
    seen = new Set<string>();
  const add = (
    candidate: Pair,
    matchSource: Choice["matchSource"],
    confidence: number | null,
    evidence: string[],
  ) => {
    const key = candidate.catalogEntryId + ":" + (candidate.catalogVariantId ?? "");
    if (choices.length >= 20 || seen.has(key)) return;
    seen.add(key);
    choices.push({ ...candidate, index: choices.length, matchSource, confidence, evidence });
  };
  for (const candidate of analysis.catalogCandidates)
    add(candidate, "MODEL", candidate.confidence, candidate.evidence);
  const tokens = new Map<string, { type: string; value: string }>();
  for (const identifier of analysis.identifiers) {
    const compact = identifier.type.replace(/[\s_-]/gu, "").toUpperCase();
    const family = /^EAN(?:8|13)?$/u.test(compact)
      ? "EAN"
      : /^UPC(?:A|E)?$/u.test(compact)
        ? "UPC"
        : /^ISBN(?:10|13)?$/u.test(compact)
          ? "ISBN"
          : null;
    try {
      const canonical = parseItemIdentifiers([
        { type: family ?? identifier.type, value: identifier.value },
      ])[0]!;
      const aliases = family
        ? [family.toLowerCase(), compact.toLowerCase(), identifier.type.toLowerCase()]
        : [canonical.type.toLowerCase()];
      for (const type of aliases)
        for (const value of [identifier.value, canonical.normalizedValue]) {
          if (!/^[a-z][a-z0-9_]{0,63}$/u.test(type) || value.length > 500) continue;
          tokens.set(type + "\0" + value, { type, value });
        }
    } catch (error) {
      if (!(error instanceof IdentifierServiceError))
        throw error; /* invalid visible code remains reviewable but is not a lookup key */
    }
  }
  if (tokens.size) {
    const values = Prisma.join(
      [...tokens.values()].map((token) => Prisma.sql`(${token.type}::text,${token.value}::text)`),
    );
    const matches = await tx.$queryRaw<Pair[]>(
      Prisma.sql`WITH evidence(type,value) AS (VALUES ${values}) SELECT DISTINCT c."entryId" AS "catalogEntryId",c."variantId" AS "catalogVariantId" FROM evidence t JOIN "CatalogExternalIdentifier" c ON c.value=t.value AND lower(c.type)=t.type JOIN "CatalogEntry" e ON e.id=c."entryId" WHERE c.active AND (c."variantId" IS NULL OR EXISTS(SELECT 1 FROM "CatalogVariant" v WHERE v.id=c."variantId" AND v."entryId"=e.id AND v.active)) ORDER BY "catalogEntryId","catalogVariantId" NULLS FIRST LIMIT 10`,
    );
    for (const candidate of matches) add(candidate, "VISIBLE_IDENTIFIER", null, []);
  }
  if (analysis.title !== null && choices.length < 20) {
    const matches = await tx.$queryRaw<Pair[]>(
      Prisma.sql`SELECT id AS "catalogEntryId",NULL::uuid AS "catalogVariantId" FROM "CatalogEntry" WHERE lower(authored#>>'{text,title}')=lower(${analysis.title}) ORDER BY id LIMIT 10`,
    );
    for (const candidate of matches) add(candidate, "SUGGESTED_TITLE", null, []);
  }
  return choices;
}
