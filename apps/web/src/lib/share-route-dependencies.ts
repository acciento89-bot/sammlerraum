import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { createShareRouteDependencies, createShareRouteHandlers } from "./share-routes";
export async function shareRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createShareRouteHandlers(
    createShareRouteDependencies(
      prisma,
      auth,
      serverEnv.APP_ORIGIN,
      new LocalPersistentStorage(
        serverEnv.UPLOADS_DIR,
        createMediaAssetLocker(serverEnv.DATABASE_URL),
      ),
    ),
  );
}
