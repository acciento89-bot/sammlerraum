import { catalogLinkRouteHandlers } from "../../../../../../../../lib/catalog-link-route-dependencies";
export async function GET(
  request: Request,
  context: { params: Promise<{ entryId: string; revision: string }> },
) {
  const { entryId, revision } = await context.params;
  return (await catalogLinkRouteHandlers()).REVISION(request, entryId, revision);
}
