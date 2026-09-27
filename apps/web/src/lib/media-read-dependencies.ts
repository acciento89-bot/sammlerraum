import { createResourceQuery } from "@sammlerraum/domain/api/resource-query";
import { createMediaReadService } from "@sammlerraum/domain/media/media-read";
import { LocalPersistentStorage } from "@sammlerraum/storage";

import { createMediaReadHandlers } from "./media-read-routes";

export async function mediaReadHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  const storage = new LocalPersistentStorage(serverEnv.UPLOADS_DIR);
  const resources = createResourceQuery(prisma);
  const service = createMediaReadService(prisma, resources.loadItem);
  return createMediaReadHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    resolveRead: service.resolveRead,
    storage,
  });
}
