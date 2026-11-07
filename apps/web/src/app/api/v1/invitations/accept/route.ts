import { invitationRouteHandlers } from "../../../../../lib/invitation-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await invitationRouteHandlers()).ACCEPT(request);
}
