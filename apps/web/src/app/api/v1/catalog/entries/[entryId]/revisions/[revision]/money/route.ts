import { catalogMoneyRouteHandlers } from "../../../../../../../../../lib/catalog-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  context: { params: Promise<{ entryId: string; revision: string }> },
) {
  const p = await context.params;
  return (await catalogMoneyRouteHandlers()).READ(request, p.entryId, p.revision);
}
