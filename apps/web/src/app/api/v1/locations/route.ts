import { managementHandlers } from "../../../../lib/management-handlers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await managementHandlers()).GET_LOCATIONS(request);
}
export async function POST(request: Request) {
  return (await managementHandlers()).POST_LOCATION(request);
}
