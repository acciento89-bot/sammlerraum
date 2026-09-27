import { managementHandlers } from "../../../../../../../lib/management-handlers";

type Context = { params: Promise<{ itemId: string; fieldId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PUT(request: Request, context: Context) {
  const p = await context.params;
  return (await managementHandlers()).PUT_CUSTOM_FIELD_VALUE(request, p.itemId, p.fieldId);
}
