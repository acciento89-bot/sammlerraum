import { z } from "zod";
import {
  MoneyViewSchema,
  LegacyMoneySubjectSchema,
  LegacyMoneyIdSchema,
  ClassifyMoneyInputSchema,
  RevokeMoneyInputSchema,
} from "./legacy-money";
import { MoneyHistoryEventSchema } from "./personal-money";

export const CatalogMoneySubjectSchema = LegacyMoneySubjectSchema.options[2];
export const CatalogMoneyScopeSchema = CatalogMoneySubjectSchema.pick({
  entryId: true,
  revision: true,
});
export const CatalogMoneyPathSchema = CatalogMoneySubjectSchema.pick({
  target: true,
  definitionId: true,
});
export const ClassifyCatalogMoneyInputSchema = CatalogMoneyPathSchema.extend({
  schemaVersion: z.literal(1),
  input: ClassifyMoneyInputSchema,
}).strict();
export const RevokeCatalogMoneyInputSchema = CatalogMoneyPathSchema.extend({
  schemaVersion: z.literal(1),
  input: RevokeMoneyInputSchema,
}).strict();
/** Moderator-only audit view; immutable snapshot v1 and public MoneyView stay unchanged. */
export const CatalogMoneyHistoryEventSchema = MoneyHistoryEventSchema.omit({
  generation: true,
}).extend({
  originSubject: CatalogMoneySubjectSchema.nullable(),
  revocationId: LegacyMoneyIdSchema.nullable(),
});

export {
  scanCatalogMoneyJson,
  copyBoundedCatalogMoneyInput as copyCatalogMoneyInput,
} from "./search-parser";

export const CatalogMoneyRevisionResultSchema = CatalogMoneyScopeSchema.extend({
  schemaVersion: z.literal(1),
  money: z.array(MoneyViewSchema).max(10100),
}).strict();
export const CatalogMoneyHistoryResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: CatalogMoneySubjectSchema,
    events: z.array(CatalogMoneyHistoryEventSchema).max(50),
    nextCursor: z.string().max(2048).nullable(),
  })
  .strict();
