import { MembershipError } from "@sammlerraum/contracts/collaboration";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
/** Internal composition budget: canonical PIN preflight and subsequent snapshots share one deadline.
 * Tests may shorten this deadline; neither a caller nor nested composition can extend it. */
export function scopedReadBudgetDatabase(
  database: MembershipDatabase,
  durationMs = 12000,
): MembershipDatabase {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 12000)
    throw new RangeError("Invalid scoped read budget");
  const stop = performance.now() + durationMs;
  const remaining = () => {
    const left = Math.floor(stop - performance.now());
    if (left < 1) throw new MembershipError("MEMBERSHIP_UNAVAILABLE");
    return left;
  };
  return {
    async $transaction(work, options) {
      const left = remaining();
      try {
        const result = await database.$transaction(
          (raw) =>
            work({
              $queryRaw: async <T>(query: Parameters<typeof raw.$queryRaw>[0]) => {
                remaining();
                const rows = await raw.$queryRaw<T>(query);
                remaining();
                return rows;
              },
            }),
          {
            ...options,
            maxWait: Math.min(options.maxWait, left),
            timeout: Math.min(options.timeout, left),
          },
        );
        remaining();
        return result;
      } catch (error) {
        remaining();
        throw error;
      }
    },
  };
}
