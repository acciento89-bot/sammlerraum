import { catalogLinkRouteHandlers } from "../../../../../lib/catalog-link-route-dependencies";
export async function GET(request: Request) {
  return (await catalogLinkRouteHandlers()).CAPABILITIES(request);
}
