import { insuranceReportRouteHandlers } from "../../../../../lib/insurance-report-route-dependencies";
export async function POST(request: Request) {
  return (await insuranceReportRouteHandlers()).POST(request);
}
