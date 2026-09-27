import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaService } from "@sammlerraum/domain/media/media-service";

import { createMediaRouteHandlers } from "./media-routes";

export async function mediaRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  const storage = new LocalPersistentStorage(serverEnv.UPLOADS_DIR);
  return createMediaRouteHandlers({
    appOrigin: serverEnv.APP_ORIGIN,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createMediaService: () =>
      createMediaService(prisma, storage, {
        maxImageBytes: serverEnv.MEDIA_MAX_IMAGE_BYTES,
        maxDocumentBytes: serverEnv.MEDIA_MAX_DOCUMENT_BYTES,
        maxImagePixels: serverEnv.MEDIA_MAX_IMAGE_PIXELS,
      }),
    limits: {
      maxImageBytes: serverEnv.MEDIA_MAX_IMAGE_BYTES,
      maxDocumentBytes: serverEnv.MEDIA_MAX_DOCUMENT_BYTES,
    },
  });
}
