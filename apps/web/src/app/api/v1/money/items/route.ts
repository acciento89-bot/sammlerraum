import { legacyMoneyRouteHandlers } from "../../../../../lib/legacy-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await legacyMoneyRouteHandlers()).CREATE(request);
}
