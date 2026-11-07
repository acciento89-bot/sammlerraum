import { communityWorkspaceHandlers } from "../../../../../lib/community-wishlist-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await communityWorkspaceHandlers()).DUPLICATES(request);
}
export async function POST(request: Request) {
  return (await communityWorkspaceHandlers()).MARK_DUPLICATE(request);
}
export async function DELETE(request: Request) {
  return (await communityWorkspaceHandlers()).UNMARK_DUPLICATE(request);
}
