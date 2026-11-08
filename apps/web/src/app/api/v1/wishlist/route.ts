import { communityWorkspaceHandlers } from "../../../../lib/community-wishlist-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await communityWorkspaceHandlers()).WISHLIST(request);
}
export async function POST(request: Request) {
  return (await communityWorkspaceHandlers()).CREATE(request);
}
