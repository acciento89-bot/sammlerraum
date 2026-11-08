import { z } from "zod";
/** Owner-only DTO: never part of the public profile projection. */
export const SearchPreferenceSchema = z
  .object({
    searchEngineIndexingEnabled: z.boolean(),
    publicLocale: z.enum(["de", "en"]),
    revision: z.number().int().min(0).max(2147483647),
  })
  .strict();
export const SearchPreferenceInput = SearchPreferenceSchema.extend({
  revision: z.number().int().min(0).max(2147483646),
}).strict();
export const SearchPreferenceReadResponse = z
  .object({ preference: SearchPreferenceSchema.nullable() })
  .strict();
export const SearchPreferenceWriteResponse = z
  .object({ preference: SearchPreferenceSchema })
  .strict();
export type SearchPreference = z.infer<typeof SearchPreferenceSchema>;
