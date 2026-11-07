import { smartCollectionRouteHandlers } from "../../../../../../lib/smart-collection-route-dependencies";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return (await smartCollectionRouteHandlers()).GET_ITEMS(request, (await context.params).id);
}
