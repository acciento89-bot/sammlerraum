import { createImportRouteHandlers } from "./import-routes";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
async function dependencies() {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  const lock = createMediaAssetLocker(serverEnv.DATABASE_URL);
  return createImportRouteHandlers({
    database: createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
    storage: new LocalPersistentStorage(serverEnv.UPLOADS_DIR, lock),
    lock,
    appOrigin: serverEnv.APP_ORIGIN,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  });
}
let handlers: ReturnType<typeof dependencies> | undefined;
export const importRouteHandlers = () => (handlers ??= dependencies());
