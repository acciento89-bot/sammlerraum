import { socialHandlers } from "../../../../../lib/social-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await socialHandlers()).FAVORITES(request);
}
export async function POST(request: Request) {
  return (await socialHandlers()).FAVORITE(request);
}
export async function DELETE(request: Request) {
  return (await socialHandlers()).UNFAVORITE(request);
}
