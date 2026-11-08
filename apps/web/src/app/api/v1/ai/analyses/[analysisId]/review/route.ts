import { aiApplyHandlers } from "../../../../../../../lib/ai-route-dependencies";
type Context = { params: Promise<{ analysisId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) {
  return (await aiApplyHandlers()).REVIEW(request, (await context.params).analysisId);
}
