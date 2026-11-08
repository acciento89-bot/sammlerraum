import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { AIAnalysisError } from "@sammlerraum/contracts/ai";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
export const AIUsagePeriodSchema = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/u)
  .refine((value) => Number(value.slice(0, 4)) >= 1 && Number(value.slice(0, 4)) <= 9998);
export function createAIUsageService(database: MembershipDatabase) {
  return {
    async getAIUsage(userId: unknown, periodInput: unknown) {
      const who = MembershipActorIdSchema.safeParse(userId),
        period = AIUsagePeriodSchema.safeParse(periodInput);
      if (!who.success) throw new AIAnalysisError("AI_ITEM_NOT_FOUND");
      if (!period.success) throw new AIAnalysisError("AI_INVALID_REQUEST");
      try {
        return await runTransferTransaction(database, async (tx) => {
          const [user] = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "user" WHERE id=${who.data} AND "emailVerified" FOR SHARE`,
          );
          if (!user) throw new AIAnalysisError("AI_ITEM_NOT_FOUND");
          const start = `${period.data}-01`;
          const [jobs] = await tx.$queryRaw<
            {
              requests: number;
              completed: number;
              failed: number;
              cancelled: number;
              inProgress: number;
            }[]
          >(
            Prisma.sql`SELECT count(*)::int AS requests,count(*) FILTER(WHERE status='READY')::int AS completed,count(*) FILTER(WHERE status='FAILED')::int AS failed,count(*) FILTER(WHERE status='CANCELLED')::int AS cancelled,count(*) FILTER(WHERE status IN ('PENDING','PROCESSING'))::int AS "inProgress" FROM "AIAnalysisJob" WHERE "requesterId"=${who.data} AND "createdAt">=${start}::date AND "createdAt"<${start}::date+interval '1 month'`,
          );
          const [tokens] = await tx.$queryRaw<
            {
              attempts: number;
              inputTokens: string | null;
              outputTokens: string | null;
              unknownInputAttempts: number;
              unknownOutputAttempts: number;
            }[]
          >(
            Prisma.sql`WITH usage AS (SELECT CASE WHEN r."attemptToken" IS NOT NULL THEN r."inputTokens" ELSE a."inputTokens" END AS input,CASE WHEN r."attemptToken" IS NOT NULL THEN r."outputTokens" ELSE a."outputTokens" END AS output FROM "AIAnalysisAttempt" a JOIN "AIAnalysisJob" j ON j.id=a."jobId" LEFT JOIN "AIAnalysisUsageReport" r ON r."attemptToken"=a.token WHERE j."requesterId"=${who.data} AND j."createdAt">=${start}::date AND j."createdAt"<${start}::date+interval '1 month') SELECT count(*)::int AS attempts,sum(input)::text AS "inputTokens",sum(output)::text AS "outputTokens",count(*) FILTER(WHERE input IS NULL)::int AS "unknownInputAttempts",count(*) FILTER(WHERE output IS NULL)::int AS "unknownOutputAttempts" FROM usage`,
          );
          if (!jobs || !tokens) throw new AIAnalysisError("AI_UNAVAILABLE");
          return { period: period.data, ...jobs, ...tokens };
        });
      } catch (error) {
        if (error instanceof MembershipError) throw new AIAnalysisError("AI_UNAVAILABLE");
        throw error;
      }
    },
  };
}
