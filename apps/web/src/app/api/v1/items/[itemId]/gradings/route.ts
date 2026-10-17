import { gradingRouteHandlers } from "../../../../../../lib/grading-route-dependencies";
type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await gradingRouteHandlers()).GET_GRADINGS(request, (await context.params).itemId);
}
export async function POST(request: Request, context: Context) {
  return (await gradingRouteHandlers()).POST_GRADING(request, (await context.params).itemId);
}
