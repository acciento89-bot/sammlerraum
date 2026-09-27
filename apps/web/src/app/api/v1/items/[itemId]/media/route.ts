import { mediaRouteHandlers } from "../../../../../../lib/media-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  return (await mediaRouteHandlers()).POST_ITEM_IMAGE(request, itemId);
}
