import { notificationHandlers } from "../../../../../../lib/notification-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  return (await notificationHandlers()).READ(request, (await context.params).notificationId);
}
