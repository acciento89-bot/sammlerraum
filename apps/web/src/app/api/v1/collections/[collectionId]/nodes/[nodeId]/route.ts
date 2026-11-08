import { managementHandlers } from "../../../../../../../lib/management-handlers";

type Context = { params: Promise<{ collectionId: string; nodeId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PATCH(request: Request, context: Context) {
  const params = await context.params;
  return (await managementHandlers()).PATCH_NODE(request, params.collectionId, params.nodeId);
}
