import { mediaReadHandlers } from "../../../../../../lib/media-read-dependencies";

type Context = { params: Promise<{ assetId: string; variant: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: Context) {
  const { assetId, variant } = await context.params;
  return (await mediaReadHandlers()).GET(request, assetId, variant);
}
