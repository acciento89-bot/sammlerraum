import { insuranceRouteHandlers } from "../../../../lib/insurance-route-dependencies";
export async function GET(request: Request) {
  return (await insuranceRouteHandlers()).GET(request);
}
export async function PUT(request: Request) {
  return (await insuranceRouteHandlers()).PUT(request);
}
