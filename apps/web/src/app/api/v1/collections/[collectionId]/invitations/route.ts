import { invitationRouteHandlers } from "../../../../../../lib/invitation-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ collectionId: string }> };
export async function GET(request: Request, context: Context) {
  return (await invitationRouteHandlers()).GET(request, (await context.params).collectionId);
}
export async function POST(request: Request, context: Context) {
  return (await invitationRouteHandlers()).POST(request, (await context.params).collectionId);
}
