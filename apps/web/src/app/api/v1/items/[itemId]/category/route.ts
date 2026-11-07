import { conditionRouteHandlers } from "../../../../../../lib/condition-route-dependencies";
type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PUT(request: Request, context: Context) {
  return (await conditionRouteHandlers()).PUT_CATEGORY(request, (await context.params).itemId);
}
