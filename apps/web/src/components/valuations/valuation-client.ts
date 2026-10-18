import { z } from "zod";
import {
  ManualValuationSchema,
  ValuationSummarySchema,
  SourceHistorySchema,
  type SummaryOptions,
} from "@sammlerraum/contracts/valuations";
import { ValuationHttpError, type ValuationTransport } from "./valuation-state";
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});
async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (response.status === 401 || response.status === 404)
    throw new ValuationHttpError(
      response.status,
      response.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
    );
  if (!response.ok) {
    const error = errorSchema.safeParse(await response.json().catch(() => null));
    if (!error.success) throw new Error("Invalid error response");
    throw new ValuationHttpError(response.status, error.data.error.code);
  }
  return schema.parse(await response.json());
}
export function valuationTransport(itemId: string): ValuationTransport {
  const url = `/api/v1/items/${encodeURIComponent(itemId)}/valuations`;
  return {
    async summary(options: SummaryOptions, signal) {
      const query = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
      const data = await read(
        await fetch(`${url}?${query}`, { cache: "no-store", signal: signal ?? null }),
        z.object({ summary: ValuationSummarySchema }).strict(),
      );
      if (data.summary.itemId !== itemId) throw new Error("Wrong item");
      return data.summary;
    },
    async source(source, cursor, signal) {
      const query = new URLSearchParams({
        view: "source-history",
        source,
        limit: "20",
        ...(cursor ? { cursor } : {}),
      });
      const data = await read(
        await fetch(`${url}?${query}`, { cache: "no-store", signal: signal ?? null }),
        z.object({ sourceHistory: SourceHistorySchema }).strict(),
      );
      if (data.sourceHistory.itemId !== itemId) throw new Error("Wrong item");
      return data.sourceHistory;
    },
    async append(input) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      if (response.ok && response.status !== 201) throw new Error("Unconfirmed write");
      return (await read(response, z.object({ valuation: ManualValuationSchema }).strict()))
        .valuation;
    },
  };
}
