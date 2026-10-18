import { itemSearchRouteHandlers } from "../../../../../lib/item-search-route-dependencies";
export async function GET(request: Request) {
  return (await itemSearchRouteHandlers()).GET(request);
}
