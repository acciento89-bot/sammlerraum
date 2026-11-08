import { createSearchPreferenceService } from "@sammlerraum/domain/seo/search-preference-service";
import { createSearchPreferenceHandlers } from "../../../../../lib/search-preference-routes";
async function handlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("../../../../../lib/auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createSearchPreferenceHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createSearchPreferenceService(prisma),
    appOrigin: serverEnv.APP_ORIGIN,
  });
}
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await handlers()).GET(request);
}
export async function PUT(request: Request) {
  return (await handlers()).PUT(request);
}
