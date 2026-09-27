import { mediaRouteHandlers } from "../../../../../lib/media-route-dependencies";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await mediaRouteHandlers()).POST_IMAGE(request);
}
