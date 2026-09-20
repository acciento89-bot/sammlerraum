import { managementHandlers } from "../../../../../lib/management-handlers";

type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await managementHandlers()).GET_ITEM(request, (await context.params).itemId);
}
export async function PATCH(request: Request, context: Context) {
  return (await managementHandlers()).PATCH_ITEM(request, (await context.params).itemId);
}
export async function DELETE(request: Request, context: Context) {
  return (await managementHandlers()).DELETE_ITEM(request, (await context.params).itemId);
}
