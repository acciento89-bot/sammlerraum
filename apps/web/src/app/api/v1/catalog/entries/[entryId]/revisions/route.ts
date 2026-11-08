import { catalogLinkRouteHandlers } from "../../../../../../../lib/catalog-link-route-dependencies";
export async function GET(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await context.params;
  return (await catalogLinkRouteHandlers()).HISTORY(request, entryId);
}
