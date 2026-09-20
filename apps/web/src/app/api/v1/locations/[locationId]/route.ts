import { managementHandlers } from "../../../../../lib/management-handlers";

type Context = { params: Promise<{ locationId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) { return (await managementHandlers()).GET_LOCATION(request, (await context.params).locationId); }
export async function PATCH(request: Request, context: Context) { return (await managementHandlers()).PATCH_LOCATION(request, (await context.params).locationId); }
