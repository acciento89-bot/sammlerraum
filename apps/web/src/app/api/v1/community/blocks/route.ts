import { commentHandlers } from "../../../../../lib/comment-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await commentHandlers()).OWN_BLOCKS(request);
}
export async function POST(request: Request) {
  return (await commentHandlers()).BLOCK_USER(request);
}
export async function DELETE(request: Request) {
  return (await commentHandlers()).UNBLOCK_USER(request);
}
