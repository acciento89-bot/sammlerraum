import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import { CommunityError } from "@sammlerraum/contracts/community";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
import type { SearchReadTransaction } from "../search/search-read";
import type { CommunityDatabase } from "./social-service";
export type CommunityActor = { userId: string };
export function communityActor(who: CommunityActor) {
  const result = MembershipActorIdSchema.safeParse(who?.userId);
  if (!result.success) throw new CommunityError("COMMUNITY_INVALID");
  return result.data;
}
export async function communityTransaction<T>(
  db: CommunityDatabase,
  work: (tx: SearchReadTransaction) => Promise<T>,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout','5000ms',true)`,
        );
        return work(tx);
      },
      { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
    );
  } catch (error) {
    if (error instanceof CommunityError) throw error;
    if (isReadDependencyFailure(error)) throw new CommunityError("COMMUNITY_UNAVAILABLE");
    throw error;
  }
}
