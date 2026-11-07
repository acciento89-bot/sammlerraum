import { catalogLinkRouteHandlers } from "../../../../../../lib/catalog-link-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ itemId: string }> };
export async function GET(request: Request, context: Context) {
  return (await catalogLinkRouteHandlers()).GET_LINK(request, (await context.params).itemId);
}
export async function PUT(request: Request, context: Context) {
  return (await catalogLinkRouteHandlers()).PUT_LINK(request, (await context.params).itemId);
}
export async function DELETE(request: Request, context: Context) {
  return (await catalogLinkRouteHandlers()).DELETE_LINK(request, (await context.params).itemId);
}
