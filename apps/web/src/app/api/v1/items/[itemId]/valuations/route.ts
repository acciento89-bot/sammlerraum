import { valuationRouteHandlers } from "../../../../../../lib/valuation-route-dependencies";
type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await valuationRouteHandlers()).GET(request, (await context.params).itemId);
}
export async function POST(request: Request, context: Context) {
  return (await valuationRouteHandlers()).POST(request, (await context.params).itemId);
}
