import { communityWorkspaceHandlers } from "../../../../../lib/community-wishlist-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function DELETE(request: Request, context: { params: Promise<{ wishId: string }> }) {
  return (await communityWorkspaceHandlers()).REMOVE(request, (await context.params).wishId);
}
