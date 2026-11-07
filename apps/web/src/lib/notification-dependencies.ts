import { createNotificationDependencies, createNotificationHandlers } from "./notification-routes";
export async function notificationHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createNotificationHandlers(
    createNotificationDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
