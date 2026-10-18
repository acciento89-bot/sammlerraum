import { catalogProposalRouteHandlers } from "../../../../../../../lib/catalog-proposal-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  return (await catalogProposalRouteHandlers()).POST_ROLLBACK(
    request,
    (await context.params).entryId,
  );
}
