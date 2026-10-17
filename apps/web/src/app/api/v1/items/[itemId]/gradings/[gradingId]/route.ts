import { gradingRouteHandlers } from "../../../../../../../lib/grading-route-dependencies";
type Context = { params: Promise<{ itemId: string; gradingId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  const { itemId, gradingId } = await context.params;
  return (await gradingRouteHandlers()).GET_GRADING(request, itemId, gradingId);
}
export async function PUT(request: Request, context: Context) {
  const { itemId, gradingId } = await context.params;
  return (await gradingRouteHandlers()).PUT_GRADING(request, itemId, gradingId);
}
export async function DELETE(request: Request, context: Context) {
  const { itemId, gradingId } = await context.params;
  return (await gradingRouteHandlers()).DELETE_GRADING(request, itemId, gradingId);
}
