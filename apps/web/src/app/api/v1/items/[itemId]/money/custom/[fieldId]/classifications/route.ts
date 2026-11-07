import { legacyMoneyRouteHandlers } from "../../../../../../../../../lib/legacy-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  context: { params: Promise<{ itemId: string; fieldId: string }> },
) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).HISTORY(request, p.itemId, p.fieldId);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string; fieldId: string }> },
) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).CLASSIFY(request, p.itemId, p.fieldId);
}
