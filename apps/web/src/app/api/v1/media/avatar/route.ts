import { mediaRouteHandlers } from "../../../../../lib/media-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function DELETE(request: Request) {
  return (await mediaRouteHandlers()).DELETE_AVATAR(request);
}
