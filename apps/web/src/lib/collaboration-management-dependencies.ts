import {
  createCollaborationManagementDependencies,
  createCollaborationManagementHandlers,
} from "./collaboration-management-routes";
export async function collaborationManagementHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCollaborationManagementHandlers(
    createCollaborationManagementDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
