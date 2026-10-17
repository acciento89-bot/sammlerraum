import { mediaRouteHandlers } from "../../../../../../../lib/media-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function DELETE(
  request: Request,
  context: { params: Promise<{ itemId: string; linkId: string }> },
) {
  const { itemId, linkId } = await context.params;
  return (await mediaRouteHandlers()).DELETE_ITEM_DOCUMENT(request, itemId, linkId);
}
