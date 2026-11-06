import { legacyMoneyRouteHandlers } from "../../../../../../../../../lib/legacy-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string; fieldId: string }> },
) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).REVOKE(request, p.itemId, p.fieldId);
}
