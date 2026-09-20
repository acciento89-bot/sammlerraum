import { managementHandlers } from "../../../../../../../lib/management-handlers";

type Context = { params: Promise<{ nodeId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PATCH(request: Request, context: Context) { return (await managementHandlers()).PATCH_NODE(request, (await context.params).nodeId); }
