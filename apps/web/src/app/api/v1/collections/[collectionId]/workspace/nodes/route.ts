import { collaborationManagementHandlers } from "../../../../../../../lib/collaboration-management-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const params = await context.params;
  return (await collaborationManagementHandlers()).CREATE_SHARED_NODE(request, params.collectionId);
}
