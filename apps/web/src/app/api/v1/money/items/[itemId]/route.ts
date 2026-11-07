import { legacyMoneyRouteHandlers } from "../../../../../../lib/legacy-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).READ_ITEM(request, p.itemId);
}
export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).UPDATE(request, p.itemId);
}
