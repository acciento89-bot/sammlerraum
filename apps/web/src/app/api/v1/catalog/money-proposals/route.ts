import { catalogMoneyRouteHandlers } from "../../../../../lib/catalog-money-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await catalogMoneyRouteHandlers()).SUBMIT(request);
}
