import { DashboardDataSchema } from "@sammlerraum/contracts/dashboard";
import type { NormalizedItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { parsePrivateDashboardWire } from "@sammlerraum/contracts/private-search-query";
import { searchRequest } from "./search-client";
export function loadDashboard(query: NormalizedItemSearchQuery, signal: AbortSignal) {
  const body = {
    text: query.text,
    f: query.filter ? JSON.stringify(query.filter) : null,
    lifecycle: query.lifecycle,
  };
  parsePrivateDashboardWire(body);
  return searchRequest("/api/v1/dashboard", DashboardDataSchema, signal, body);
}
