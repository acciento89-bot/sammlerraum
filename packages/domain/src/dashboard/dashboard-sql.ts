import { Prisma } from "@sammlerraum/db/search-sql";
import { candidateFrom, TRUE } from "../search/search-compiler";
import { currencyMinorUnitExponent, valuationCurrencyCodes } from "../money/currencies";

// Derive the bounded SQL guard from the same authority used by valuation writes.
const manualDenominations = Prisma.join(
  valuationCurrencyCodes.map(
    (currency) => Prisma.sql`(${currency}::text,${currencyMinorUnitExponent(currency)}::integer)`,
  ),
);

/** Fixed internal JSON projections. Numeric sums leave PostgreSQL only as decimal strings. */
const measure = (where: Prisma.Sql = TRUE) =>
  Prisma.sql`jsonb_build_object('itemCount',count(*) FILTER(WHERE ${where}),'unitCount',coalesce(sum(quantity::numeric) FILTER(WHERE ${where}),0)::text)`;
const date = (column: Prisma.Sql) => Prisma.sql`to_char(${column},'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
function matched(predicate: Prisma.Sql) {
  return Prisma.sql`matched AS MATERIALIZED (SELECT i.id,i.title,i."ownerId",i."collectionId",i."categoryTemplateId",i."conditionOptionId",i.quantity,i.visibility,i."tradeStatus",i."archivedAt",i."disposedAt",i."createdAt",i."updatedAt",i."acquisitionDate",i."purchaseAmountMinor",i."purchaseCurrency",i."catalogEntryId" ${candidateFrom} WHERE ${predicate})`;
}
const hasManual = Prisma.sql`EXISTS(SELECT 1 FROM "Valuation" v WHERE v."itemId"=i.id AND v."ownerId"=i."ownerId" AND v.type='MANUAL' AND v.basis='PER_UNIT')`;
const hasGrading = Prisma.sql`EXISTS(SELECT 1 FROM "Grading" g WHERE g."itemId"=i.id AND g."ownerId"=i."ownerId")`;
const media = (document: boolean) =>
  Prisma.sql`EXISTS(SELECT 1 FROM ${document ? Prisma.sql`"DocumentLink"` : Prisma.sql`"MediaLink"`} l JOIN "MediaAsset" m ON m.id=l."assetId" AND m."ownerId"=l."ownerId" WHERE l."itemId"=i.id AND l."ownerId"=i."ownerId" AND m.kind::text=${document ? "DOCUMENT" : "IMAGE"} AND m.status='READY' AND m."cleanupStartedAt" IS NULL)`;
export function dashboardSummarySql(owner: string, predicate: Prisma.Sql) {
  return Prisma.sql`/* dashboard:summary */ WITH ${matched(predicate)}, facts AS MATERIALIZED (
 SELECT i.*,${hasManual} AS manual,${hasGrading} AS graded,${media(false)} AS image,${media(true)} AS document FROM matched i)
 SELECT jsonb_build_object(
 'selection',${measure()} || jsonb_build_object('matchedCollectionCount',count(DISTINCT "collectionId")),
 'collections',jsonb_build_object('ownedLiveCount',(SELECT count(*) FROM "Collection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL)),
 'trade',(SELECT jsonb_agg(bucket ORDER BY status COLLATE pg_catalog."C") FROM (SELECT status,(SELECT ${measure()} || jsonb_build_object('tradeStatus',status) FROM facts WHERE "tradeStatus"::text=status) AS bucket FROM (VALUES('NOT_FOR_TRADE'),('OPEN_TO_TRADE'),('FOR_SALE'),('RESERVED')) s(status)) buckets),
 'tradeReady',${measure(Prisma.sql`"tradeStatus" IN ('OPEN_TO_TRADE','FOR_SALE')`)},
 'missing',jsonb_build_object('category',${measure(Prisma.sql`"categoryTemplateId" IS NULL`)},'condition',${measure(Prisma.sql`"conditionOptionId" IS NULL`)},'acquisitionDate',${measure(Prisma.sql`"acquisitionDate" IS NULL`)},'purchaseAmount',${measure(Prisma.sql`"purchaseAmountMinor" IS NULL AND "purchaseCurrency" IS NULL`)},'ownEstimate',${measure(Prisma.sql`NOT manual`)},'grading',${measure(Prisma.sql`NOT graded`)},'catalogLink',${measure(Prisma.sql`"catalogEntryId" IS NULL`)},'image',${measure(Prisma.sql`NOT image`)},'document',${measure(Prisma.sql`NOT document`)})) AS data FROM facts`;
}
export function dashboardManualSql(predicate: Prisma.Sql) {
  return Prisma.sql`/* dashboard:manual */ WITH ${matched(predicate)}, valid_denominations(currency,exponent) AS (VALUES ${manualDenominations}), selected_points AS MATERIALIZED (
 SELECT i.id,i.title,i."collectionId",i.quantity,v.id AS valuation_id,v."amountMinor" AS amount,v.currency,v."minorUnitExponent" AS exponent,v."observedAt" AS observed,
 p.id AS previous_id,p."amountMinor" AS previous_amount,p.currency AS previous_currency,p."minorUnitExponent" AS previous_exponent,p."observedAt" AS previous_observed
 FROM matched i
 LEFT JOIN LATERAL (SELECT v.* FROM "Valuation" v WHERE v."itemId"=i.id AND v."ownerId"=i."ownerId" AND v.type='MANUAL' AND v.basis='PER_UNIT' ORDER BY v."observedAt" DESC,v."createdAt" DESC,v.id DESC LIMIT 1) v ON true
 LEFT JOIN LATERAL (SELECT p.* FROM "Valuation" p WHERE p."itemId"=i.id AND p."ownerId"=i."ownerId" AND p.type='MANUAL' AND p.basis='PER_UNIT' AND p."observedAt"<v."observedAt" ORDER BY p."observedAt" DESC,p."createdAt" DESC,p.id DESC LIMIT 1) p ON true
 ), integrity AS MATERIALIZED (SELECT NOT EXISTS (
 SELECT 1 FROM selected_points p WHERE
 (valuation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM valid_denominations d WHERE d.currency=p.currency AND d.exponent=p.exponent)) OR
 (previous_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM valid_denominations d WHERE d.currency=p.previous_currency AND d.exponent=p.previous_exponent))
 ) AS valid),
 points AS MATERIALIZED (SELECT * FROM selected_points WHERE (SELECT valid FROM integrity)),
 classified AS MATERIALIZED (SELECT *,valuation_id IS NOT NULL AND previous_id IS NOT NULL AND currency=previous_currency AND exponent=previous_exponent AS comparable FROM points),
 denominations AS MATERIALIZED (SELECT currency,exponent FROM points WHERE valuation_id IS NOT NULL GROUP BY currency,exponent LIMIT 257),
 sizes AS (SELECT count(*) AS groups FROM denominations),
 totals AS (SELECT count(*) AS selected,count(valuation_id) AS valued,count(*) FILTER(WHERE comparable) AS compared FROM classified),
 ranked AS (SELECT *,row_number() OVER(PARTITION BY currency,exponent ORDER BY amount::numeric*quantity DESC,id DESC) AS rank FROM points WHERE valuation_id IS NOT NULL),
 value_groups AS (SELECT d.currency,d.exponent,jsonb_build_object('source','MANUAL','basis','PER_UNIT','currency',d.currency,'minorUnitExponent',d.exponent,
 'totalMinor',sum(amount::numeric*quantity)::text,'contributors',${measure()},
 'otherDenomination',(SELECT ${measure(Prisma.sql`valuation_id IS NOT NULL AND (currency,exponent)<>(d.currency,d.exponent)`)} FROM points),
 'observedAtFrom',${date(Prisma.sql`min(observed)`)},'observedAtTo',${date(Prisma.sql`max(observed)`)},
 'topItems',jsonb_build_object('limit',10,'eligibleCount',count(*),'hasMore',count(*)>10,'quantityBasis','CURRENT_QUANTITY','items',jsonb_agg(jsonb_build_object('id',id,'title',title,'collectionId',"collectionId",'quantity',quantity,'valuationId',valuation_id,'perUnitMinor',amount::text,'weightedMinor',(amount::numeric*quantity)::text,'observedAt',${date(Prisma.sql`observed`)}) ORDER BY rank) FILTER(WHERE rank<=10))) AS data
 FROM denominations d JOIN ranked r ON r.currency=d.currency AND r.exponent=d.exponent WHERE (SELECT groups FROM sizes)<=256 GROUP BY d.currency,d.exponent),
 change_groups AS (SELECT currency,exponent,jsonb_build_object('source','MANUAL','basis','PER_UNIT','currency',currency,'minorUnitExponent',exponent,'deltaMinor',sum((amount::numeric-previous_amount::numeric)*quantity)::text,'contributors',${measure()},'previousObservedAtFrom',${date(Prisma.sql`min(previous_observed)`)},'previousObservedAtTo',${date(Prisma.sql`max(previous_observed)`)},'latestObservedAtFrom',${date(Prisma.sql`min(observed)`)},'latestObservedAtTo',${date(Prisma.sql`max(observed)`)}) AS data FROM classified WHERE comparable AND (SELECT groups FROM sizes)<=256 GROUP BY currency,exponent)
 SELECT (SELECT valid FROM integrity) AS "denominationsValid",(SELECT groups>256 FROM sizes) AS overflow,CASE WHEN (SELECT valid FROM integrity) THEN jsonb_build_object(
 'manualValues',jsonb_build_object('state',CASE WHEN selected=0 THEN 'EMPTY' WHEN valued=0 THEN 'NO_ESTIMATES' WHEN valued<selected THEN 'PARTIAL' ELSE 'COMPLETE' END,'quantityBasis','CURRENT_QUANTITY',
 'contributors',(SELECT ${measure(Prisma.sql`valuation_id IS NOT NULL`)} FROM points),'missing',(SELECT ${measure(Prisma.sql`valuation_id IS NULL`)} FROM points),
 'groups',CASE WHEN selected>0 AND valued=0 THEN NULL ELSE coalesce((SELECT jsonb_agg(data ORDER BY currency COLLATE pg_catalog."C",exponent) FROM value_groups),'[]'::jsonb) END),
 'manualChange',jsonb_build_object('state',CASE WHEN selected=0 THEN 'EMPTY' WHEN compared=0 THEN 'INSUFFICIENT_DATA' WHEN compared<selected THEN 'PARTIAL' ELSE 'COMPLETE' END,'mode','LATEST_VS_PREVIOUS_OBSERVATION','quantityBasis','CURRENT_QUANTITY','comparable',(SELECT ${measure(Prisma.sql`comparable`)} FROM classified),
 'excluded',jsonb_build_object('NO_ESTIMATE',(SELECT ${measure(Prisma.sql`valuation_id IS NULL`)} FROM points),'INSUFFICIENT_HISTORY',(SELECT ${measure(Prisma.sql`valuation_id IS NOT NULL AND previous_id IS NULL`)} FROM points),'NONCOMPARABLE_DENOMINATION',(SELECT ${measure(Prisma.sql`previous_id IS NOT NULL AND (currency,exponent)<>(previous_currency,previous_exponent)`)} FROM points)),
 'groups',CASE WHEN selected>0 AND compared=0 THEN NULL ELSE coalesce((SELECT jsonb_agg(data ORDER BY currency COLLATE pg_catalog."C",exponent) FROM change_groups),'[]'::jsonb) END)) ELSE NULL END AS data FROM totals`;
}
export function dashboardDistributionsSql(predicate: Prisma.Sql) {
  return Prisma.sql`/* dashboard:distributions */ WITH ${matched(predicate)},
 conditions AS MATERIALIZED(SELECT i."categoryTemplateId",i."conditionOptionId",o."schemeId",o."labelKey",o."labelDe",o."labelEn",count(*) AS items,sum(i.quantity::numeric)::text AS units FROM matched i JOIN "ConditionOption" o ON o.id=i."conditionOptionId" AND o."categoryTemplateId"=i."categoryTemplateId" GROUP BY i."categoryTemplateId",i."conditionOptionId",o."schemeId",o."labelKey",o."labelDe",o."labelEn" LIMIT 129),
 records AS MATERIALIZED(SELECT g.id,g."itemId",g."providerKey",g.grade FROM matched i JOIN "Grading" g ON g."itemId"=i.id AND g."ownerId"=i."ownerId"),
 grades AS MATERIALIZED(SELECT "providerKey" COLLATE pg_catalog."C" AS provider,grade COLLATE pg_catalog."C" AS grade,count(*) AS records,count(DISTINCT "itemId") AS items FROM records GROUP BY "providerKey" COLLATE pg_catalog."C",grade COLLATE pg_catalog."C" LIMIT 129),
 sizes AS (SELECT (SELECT count(*) FROM conditions)>128 OR (SELECT count(*) FROM grades)>128 AS overflow)
 SELECT overflow,CASE WHEN NOT overflow THEN jsonb_build_object(
 'condition',jsonb_build_object('missing',(SELECT ${measure(Prisma.sql`"conditionOptionId" IS NULL`)} FROM matched),'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('categoryTemplateId',"categoryTemplateId",'conditionOptionId',"conditionOptionId",'schemeId',"schemeId",'labelKey',"labelKey",'labelDe',"labelDe",'labelEn',"labelEn",'itemCount',items,'unitCount',units) ORDER BY "categoryTemplateId","conditionOptionId") FROM conditions),'[]'::jsonb)),
 'grading',jsonb_build_object('gradedItemCount',(SELECT count(DISTINCT "itemId") FROM records),'gradingRecordCount',(SELECT count(*) FROM records),'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('providerKey',provider,'grade',grade,'recordCount',records,'itemCount',items) ORDER BY provider COLLATE pg_catalog."C",grade COLLATE pg_catalog."C") FROM grades),'[]'::jsonb))) ELSE NULL END AS data FROM sizes`;
}
export function dashboardRankingsSql(predicate: Prisma.Sql) {
  return Prisma.sql`/* dashboard:rankings */ WITH ${matched(predicate)},
 collections AS MATERIALIZED (SELECT "collectionId",count(*) AS items,sum(quantity::numeric) AS units FROM matched GROUP BY "collectionId"),
 top AS (SELECT x.*,c.name FROM collections x JOIN "Collection" c ON c.id=x."collectionId" ORDER BY units DESC,items DESC,"collectionId" DESC LIMIT 10),
 recent AS (SELECT * FROM matched ORDER BY "createdAt" DESC,id DESC LIMIT 10)
 SELECT jsonb_build_object(
 'topCollections',jsonb_build_object('limit',10,'eligibleCount',(SELECT count(*) FROM collections),'hasMore',(SELECT count(*)>10 FROM collections),'basis','SELECTED_PHYSICAL_UNITS','items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',"collectionId",'name',name,'itemCount',items,'unitCount',units::text) ORDER BY units DESC,items DESC,"collectionId" DESC) FROM top),'[]'::jsonb)),
 'recentAdditions',jsonb_build_object('limit',10,'eligibleCount',(SELECT count(*) FROM matched),'hasMore',(SELECT count(*)>10 FROM matched),'basis','INVENTORY_CREATED_AT','items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'collectionId',"collectionId",'categoryTemplateId',"categoryTemplateId",'conditionOptionId',"conditionOptionId",'quantity',quantity,'visibility',visibility,'tradeStatus',"tradeStatus",'archivedAt',${date(Prisma.sql`"archivedAt"`)},'disposedAt',${date(Prisma.sql`"disposedAt"`)},'createdAt',${date(Prisma.sql`"createdAt"`)},'updatedAt',${date(Prisma.sql`"updatedAt"`)}) ORDER BY "createdAt" DESC,id DESC) FROM recent),'[]'::jsonb))) AS data`;
}
