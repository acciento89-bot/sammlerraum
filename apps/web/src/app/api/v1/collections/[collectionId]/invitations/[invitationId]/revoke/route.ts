import { invitationRouteHandlers } from "../../../../../../../../lib/invitation-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ collectionId: string; invitationId: string }> };
export async function POST(request: Request, context: Context) {
  const params = await context.params;
  return (await invitationRouteHandlers()).REVOKE(
    request,
    params.collectionId,
    params.invitationId,
  );
}
