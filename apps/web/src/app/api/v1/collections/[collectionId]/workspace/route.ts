import { collaborationManagementHandlers } from "../../../../../../lib/collaboration-management-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const params = await context.params;
  return (await collaborationManagementHandlers()).WORKSPACE(request, params.collectionId);
}
