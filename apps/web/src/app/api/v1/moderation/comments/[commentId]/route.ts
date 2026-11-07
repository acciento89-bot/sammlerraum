import { moderationHandlers } from "../../../../../../lib/moderation-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: { params: Promise<{ commentId: string }> }) {
  return (await moderationHandlers()).REVIEW(request, (await context.params).commentId);
}
export async function POST(request: Request, context: { params: Promise<{ commentId: string }> }) {
  return (await moderationHandlers()).VISIBILITY(request, (await context.params).commentId);
}
