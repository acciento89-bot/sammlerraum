import { shareRouteHandlers } from "../../../../../../lib/share-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return (await shareRouteHandlers()).REVOKE(request, (await context.params).shareId);
}
