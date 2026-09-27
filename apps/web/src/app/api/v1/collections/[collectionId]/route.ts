import { managementHandlers } from "../../../../../lib/management-handlers";

type Context = { params: Promise<{ collectionId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await managementHandlers()).GET_COLLECTION(request, (await context.params).collectionId);
}
export async function PATCH(request: Request, context: Context) {
  return (await managementHandlers()).PATCH_COLLECTION(
    request,
    (await context.params).collectionId,
  );
}
export async function DELETE(request: Request, context: Context) {
  return (await managementHandlers()).DELETE_COLLECTION(
    request,
    (await context.params).collectionId,
  );
}
