import { z } from "zod";
import { parseDashboardQuery } from "./dashboard";
import { parseItemSearchQuery, searchFail, type NormalizedItemSearchQuery } from "./item-search";
import { parseItemFilterJson } from "./search";

export const PRIVATE_SEARCH_MAX_BODY_BYTES = 32768;
const fields = {
  text: z.string().optional(),
  f: z.string().nullable().optional(),
  lifecycle: z.string().optional(),
};
const dashboardWire = z.object(fields).strict();
const itemWire = z
  .object({
    ...fields,
    limit: z.number().int().safe().min(1).max(50).optional(),
    cursor: z.string().optional(),
  })
  .strict();
function plain(input: unknown): void {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    searchFail("SEARCH_INVALID");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) searchFail("SEARCH_INVALID");
}
export function parsePrivateItemSearchWire(input: unknown): NormalizedItemSearchQuery {
  plain(input);
  const result = itemWire.safeParse(input);
  if (!result.success) return searchFail("SEARCH_INVALID");
  const { f, ...query } = result.data;
  return parseItemSearchQuery({
    ...query,
    filter: f === undefined || f === null ? null : parseItemFilterJson(f),
  });
}
export function parsePrivateDashboardWire(input: unknown): ReturnType<typeof parseDashboardQuery> {
  plain(input);
  const result = dashboardWire.safeParse(input);
  if (!result.success) return searchFail("SEARCH_INVALID");
  const { f, ...query } = result.data;
  return parseDashboardQuery({
    ...query,
    filter: f === undefined || f === null ? null : parseItemFilterJson(f),
  });
}
