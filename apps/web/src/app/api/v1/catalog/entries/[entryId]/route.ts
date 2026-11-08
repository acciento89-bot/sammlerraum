import { catalogLinkRouteHandlers } from "../../../../../../lib/catalog-link-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ entryId: string }> };
export async function GET(request: Request, context: Context) {
  return (await catalogLinkRouteHandlers()).ENTRY(request, (await context.params).entryId);
}
