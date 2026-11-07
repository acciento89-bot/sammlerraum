import { createCommentDependencies, createCommentHandlers } from "./comment-routes";
export async function commentHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCommentHandlers(createCommentDependencies(prisma, auth, serverEnv.APP_ORIGIN));
}
