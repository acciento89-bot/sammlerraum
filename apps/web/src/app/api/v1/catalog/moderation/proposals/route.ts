import { catalogProposalRouteHandlers } from "../../../../../../lib/catalog-proposal-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await catalogProposalRouteHandlers()).GET_REVIEW_PROPOSALS(request);
}
