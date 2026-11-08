import { billingHandlers } from "../../../../../lib/billing-route-dependencies";
export async function POST(request: Request) {
  return (await billingHandlers()).PORTAL(request);
}
