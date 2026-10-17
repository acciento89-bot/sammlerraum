import { catalogProposalRouteHandlers } from "../../../../../lib/catalog-proposal-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await catalogProposalRouteHandlers()).GET_PROPOSALS(request);
}
export async function POST(request: Request) {
  return (await catalogProposalRouteHandlers()).POST_PROPOSAL(request);
}
