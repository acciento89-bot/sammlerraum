import { catalogMoneyRouteHandlers } from "../../../../../../../../../../lib/catalog-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(
  request: Request,
  context: { params: Promise<{ entryId: string; revision: string }> },
) {
  const p = await context.params;
  return (await catalogMoneyRouteHandlers()).REVOKE(request, p.entryId, p.revision);
}
