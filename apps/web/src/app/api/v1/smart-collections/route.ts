import { smartCollectionRouteHandlers } from "../../../../lib/smart-collection-route-dependencies";
export async function GET(request: Request) {
  return (await smartCollectionRouteHandlers()).GET(request);
}
export async function POST(request: Request) {
  return (await smartCollectionRouteHandlers()).POST(request);
}
