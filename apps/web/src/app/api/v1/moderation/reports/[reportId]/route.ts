import { moderationHandlers } from "../../../../../../lib/moderation-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  return (await moderationHandlers()).RESOLVE(request, (await context.params).reportId);
}
