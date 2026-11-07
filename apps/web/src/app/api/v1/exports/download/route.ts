import { artifactRouteHandlers } from "../../../../../lib/artifact-route-dependencies";
export async function GET(request: Request) {
  return (await artifactRouteHandlers()).GET_DOWNLOAD(request);
}
