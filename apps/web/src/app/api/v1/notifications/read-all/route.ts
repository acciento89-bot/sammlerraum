import { notificationHandlers } from "../../../../../lib/notification-dependencies";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) {
  return (await notificationHandlers()).ALL_READ(request);
}
