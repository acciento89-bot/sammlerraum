import { conditionRouteHandlers } from "../../../../../../lib/condition-route-dependencies";
type Context = { params: Promise<{ categoryId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await conditionRouteHandlers()).GET_SCHEME(request, (await context.params).categoryId);
}
