import { collaborationManagementHandlers } from "../../../../../lib/collaboration-management-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await collaborationManagementHandlers()).SHARED_COLLECTIONS(request);
}
