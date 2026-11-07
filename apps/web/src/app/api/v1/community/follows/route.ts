import { socialHandlers } from "../../../../../lib/social-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await socialHandlers()).FOLLOWING(request);
}
export async function POST(request: Request) {
  return (await socialHandlers()).FOLLOW(request);
}
export async function DELETE(request: Request) {
  return (await socialHandlers()).UNFOLLOW(request);
}
