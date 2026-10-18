import { mediaRouteHandlers } from "../../../../../../lib/media-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  return (await mediaRouteHandlers()).POST_ITEM_IMAGE(request, itemId);
}

export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  return (await mediaRouteHandlers()).GET_ITEM_MEDIA(request, itemId);
}

export async function PUT(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  return (await mediaRouteHandlers()).PUT_ITEM_MEDIA(request, itemId);
}
