import { catalogLinkRouteHandlers } from "../../../../../lib/catalog-link-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ categoryId: string }> };
export async function GET(request: Request, context: Context) {
  return (await catalogLinkRouteHandlers()).CATEGORY(request, (await context.params).categoryId);
}
