import {
  createCommunityWorkspaceDependencies,
  createCommunityWorkspaceHandlers,
} from "./community-wishlist-routes";
export async function communityWorkspaceHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCommunityWorkspaceHandlers(
    createCommunityWorkspaceDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
