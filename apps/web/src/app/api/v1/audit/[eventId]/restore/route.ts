import { restoreRouteHandlers } from "../../../../../../lib/restore-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ eventId: string }> };
export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params;
  return (await restoreRouteHandlers()).GET(request, eventId);
}
export async function POST(request: Request, context: Context) {
  const { eventId } = await context.params;
  return (await restoreRouteHandlers()).POST(request, eventId);
}
