import { smartCollectionRouteHandlers } from "../../../../../lib/smart-collection-route-dependencies";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return (await smartCollectionRouteHandlers()).GET_ONE(request, (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return (await smartCollectionRouteHandlers()).PATCH(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return (await smartCollectionRouteHandlers()).DELETE(request, (await context.params).id);
}
