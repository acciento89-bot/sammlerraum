import { aiCaptureHandlers } from "../../../../../lib/ai-route-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await aiCaptureHandlers()).USAGE(request);
}
