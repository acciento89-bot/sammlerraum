import { z } from "zod";
import { LEGACY_MONEY_PROFILE_ID, LEGACY_MONEY_AUTHORITY_HASH } from "./legacy-money";
/** Compatibility is affirmative and pinned; no missing-field or raw-writer fallback. */
export const MoneyCapabilitiesSchema = z
  .object({
    actorId: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[^\u0000-\u001f\u007f]+$/u),
    schemaVersion: z.literal(1),
    readVersion: z.literal(1),
    authoringProfiles: z
      .array(
        z
          .object({
            profileId: z.literal(LEGACY_MONEY_PROFILE_ID),
            authorityHash: z.literal(LEGACY_MONEY_AUTHORITY_HASH),
          })
          .strict(),
      )
      .max(1),
    classificationVersion: z.literal(1),
    canonicalConsumers: z.boolean(),
  })
  .strict();
export type MoneyCapabilities = z.infer<typeof MoneyCapabilitiesSchema>;
