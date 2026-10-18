import { catalogLinkRouteHandlers } from "../../../../lib/catalog-link-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await catalogLinkRouteHandlers()).CATEGORIES(request);
}
