import { itemSearchRouteHandlers } from "../../../../../lib/item-search-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await itemSearchRouteHandlers()).MARKET_SELECTORS(request);
}
