import { scopedSearchRouteHandlers } from "../../../../../lib/scoped-search-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return (await scopedSearchRouteHandlers()).SAVED_GET(request, (await context.params).id);
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return (await scopedSearchRouteHandlers()).SAVED_UPDATE(request, (await context.params).id);
}
