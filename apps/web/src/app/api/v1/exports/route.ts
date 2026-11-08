import { artifactRouteHandlers } from "../../../../lib/artifact-route-dependencies";
export async function GET(request: Request) {
  return (await artifactRouteHandlers()).GET_HISTORY(request);
}
export async function POST(request: Request) {
  return (await artifactRouteHandlers()).POST_EXPORT(request);
}
