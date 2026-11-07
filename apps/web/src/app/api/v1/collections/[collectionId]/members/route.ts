import { collaborationManagementHandlers } from "../../../../../../lib/collaboration-management-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  return (await collaborationManagementHandlers()).GET_MEMBERS(
    request,
    (await context.params).collectionId,
  );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  return (await collaborationManagementHandlers()).MUTATE_MEMBERS(
    request,
    (await context.params).collectionId,
  );
}
