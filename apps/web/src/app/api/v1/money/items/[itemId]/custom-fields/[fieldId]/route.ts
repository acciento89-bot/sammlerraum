import { legacyMoneyRouteHandlers } from "../../../../../../../../lib/legacy-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PUT(
  request: Request,
  context: { params: Promise<{ itemId: string; fieldId: string }> },
) {
  const p = await context.params;
  return (await legacyMoneyRouteHandlers()).CUSTOM(request, p.itemId, p.fieldId);
}
