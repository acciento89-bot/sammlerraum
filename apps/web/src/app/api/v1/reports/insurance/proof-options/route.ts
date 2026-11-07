import { artifactRouteHandlers } from "../../../../../../lib/artifact-route-dependencies";
export async function POST(request: Request) {
  return (await artifactRouteHandlers()).POST_PROOF_OPTIONS(request);
}
