import { searchReferenceRouteHandlers } from "../../../../../../lib/search-reference-route-dependencies";
export async function GET(request: Request) {
  return (await searchReferenceRouteHandlers("CONDITIONS")).GET(request);
}
export async function POST(request: Request) {
  return (await searchReferenceRouteHandlers("CONDITIONS")).POST(request);
}
