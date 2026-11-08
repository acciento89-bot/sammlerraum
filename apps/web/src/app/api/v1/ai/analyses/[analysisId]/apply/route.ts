import { aiApplyHandlers } from "../../../../../../../lib/ai-route-dependencies";
type Context = { params: Promise<{ analysisId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: Context) {
  return (await aiApplyHandlers()).APPLY(request, (await context.params).analysisId);
}
