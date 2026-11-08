import { notificationHandlers } from "../../../../../lib/notification-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await notificationHandlers()).PREFERENCES(request);
}
export async function PATCH(request: Request) {
  return (await notificationHandlers()).UPDATE_PREFERENCES(request);
}
