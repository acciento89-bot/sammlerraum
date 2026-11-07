import { dashboardRouteHandlers } from "../../../../lib/dashboard-route-dependencies";
export async function GET(request: Request) {
  return (await dashboardRouteHandlers()).GET(request);
}
export async function POST(request: Request) {
  return (await dashboardRouteHandlers()).POST(request);
}
