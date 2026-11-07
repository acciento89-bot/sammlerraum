import type { createPrismaClient } from "@sammlerraum/db/create-client";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import {
  LocalPersistentStorage,
  type StorageProvider,
  type StorageStagingLocker,
} from "@sammlerraum/storage";
export type PrivateTransferContext = {
  database: ReturnType<typeof createPrismaClient>;
  storage: StorageProvider;
  lock: StorageStagingLocker;
  appOrigin: string;
  canonicalMoneyEnabled?: boolean;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
};
async function createContext(): Promise<PrivateTransferContext> {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  const lock = createMediaAssetLocker(serverEnv.DATABASE_URL);
  return {
    database: createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
    storage: new LocalPersistentStorage(serverEnv.UPLOADS_DIR, lock),
    lock,
    appOrigin: serverEnv.APP_ORIGIN,
    canonicalMoneyEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
let context: ReturnType<typeof createContext> | undefined;
export const privateTransferContext = () => (context ??= createContext());
