import { scopedSearchRouteHandlers } from "../../../../../lib/scoped-search-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await scopedSearchRouteHandlers()).SEARCH(request);
}
