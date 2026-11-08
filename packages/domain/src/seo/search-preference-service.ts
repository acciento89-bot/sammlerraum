import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { communityActor, communityTransaction } from "../community/community-transaction";
import type { CommunityDatabase } from "../community/social-service";
export const SearchPreferenceInput = z
  .object({
    searchEngineIndexingEnabled: z.boolean(),
    publicLocale: z.enum(["de", "en"]),
    revision: z.number().int().min(0).max(2147483646),
  })
  .strict();
export type SearchPreference = z.infer<typeof SearchPreferenceInput>;
export class SearchPreferenceError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT") {
    super(code);
  }
}
const fields = Prisma.sql`"searchEngineIndexingEnabled", "publicLocale", "searchIndexingRevision" AS revision`;
/** No plan admission or profile creation: privacy controls are always available to their owner. */
export function createSearchPreferenceService(db: CommunityDatabase) {
  return {
    getOwn(userId: string) {
      const owner = communityActor({ userId });
      return communityTransaction(db, async (tx) => {
        const rows = await tx.$queryRaw<SearchPreference[]>(
          Prisma.sql`SELECT ${fields} FROM "UserProfile" WHERE "userId"=${owner}`,
        );
        return rows[0] ?? null;
      });
    },
    async updateOwn(userId: string, input: unknown) {
      const owner = communityActor({ userId }),
        value = SearchPreferenceInput.parse(input);
      return communityTransaction(db, async (tx) => {
        const rows = await tx.$queryRaw<SearchPreference[]>(
          Prisma.sql`UPDATE "UserProfile" SET "searchEngineIndexingEnabled"=${value.searchEngineIndexingEnabled}, "publicLocale"=${value.publicLocale}, "searchIndexingRevision"="searchIndexingRevision"+1, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${owner} AND "searchIndexingRevision"=${value.revision} RETURNING ${fields}`,
        );
        if (rows[0]) return rows[0];
        const exists = await tx.$queryRaw<{ found: boolean }[]>(
          Prisma.sql`SELECT true AS found FROM "UserProfile" WHERE "userId"=${owner}`,
        );
        throw new SearchPreferenceError(exists.length ? "CONFLICT" : "NOT_FOUND");
      });
    },
  };
}
