import { aiCaptureHandlers } from "../../../../../../lib/ai-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ itemId: string }> };
export async function GET(request: Request, context: Context) {
  return (await aiCaptureHandlers()).CAPTURE(request, (await context.params).itemId);
}
export async function POST(request: Request, context: Context) {
  return (await aiCaptureHandlers()).REQUEST(request, (await context.params).itemId);
}
