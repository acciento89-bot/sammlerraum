import { scopedSearchRouteHandlers } from "../../../../lib/scoped-search-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await scopedSearchRouteHandlers()).SAVED_LIST(request);
}
export async function POST(request: Request) {
  return (await scopedSearchRouteHandlers()).SAVED_CREATE(request);
}
