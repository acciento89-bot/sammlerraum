import { scopedSearchRouteHandlers } from "../../../../../../lib/scoped-search-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return (await scopedSearchRouteHandlers()).SAVED_RESOLVE(request, (await context.params).id);
}
