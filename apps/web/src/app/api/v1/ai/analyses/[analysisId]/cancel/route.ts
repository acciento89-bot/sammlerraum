import { aiCaptureHandlers } from "../../../../../../../lib/ai-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ analysisId: string }> };
export async function POST(request: Request, context: Context) {
  return (await aiCaptureHandlers()).CANCEL(request, (await context.params).analysisId);
}
