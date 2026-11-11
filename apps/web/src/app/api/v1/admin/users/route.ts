import { auth } from "../../../../../lib/auth";
import { prisma } from "@sammlerraum/db/client";
import { serverEnv } from "@sammlerraum/config/server";
import { createAdminUsersHandler } from "../../../../../lib/admin-users";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createAdminUsersHandler({
  db: prisma,
  appOrigin: serverEnv.APP_ORIGIN,
  getSession: (headers) =>
    auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
});
