import { moderationHandlers } from "../../../../../lib/moderation-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await moderationHandlers()).REPORTS(request);
}
