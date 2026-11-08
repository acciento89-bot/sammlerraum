import { catalogProposalRouteHandlers } from "../../../../../../../lib/catalog-proposal-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  return (await catalogProposalRouteHandlers()).POST_DECISION(
    request,
    (await context.params).proposalId,
  );
}
