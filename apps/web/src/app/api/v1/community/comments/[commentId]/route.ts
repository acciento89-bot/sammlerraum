import { commentHandlers } from "../../../../../../lib/comment-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  return (await commentHandlers()).DELETE_COMMENT(request, (await context.params).commentId);
}
export async function PATCH(request: Request, context: { params: Promise<{ commentId: string }> }) {
  return (await commentHandlers()).HIDE_COMMENT(request, (await context.params).commentId);
}
