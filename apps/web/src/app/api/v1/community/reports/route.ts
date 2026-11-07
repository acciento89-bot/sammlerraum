import { commentHandlers } from "../../../../../lib/comment-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await commentHandlers()).OWN_REPORTS(request);
}
export async function POST(request: Request) {
  return (await commentHandlers()).CREATE_REPORT(request);
}
