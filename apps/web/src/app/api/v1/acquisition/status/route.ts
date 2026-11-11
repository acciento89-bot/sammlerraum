import { auth } from "../../../../../lib/auth";
import { prisma } from "@sammlerraum/db/client";
import { parseAuthEnv, serverEnv } from "@sammlerraum/config/server";
import { createAcquisitionStatusHandler } from "../../../../../lib/acquisition-route";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createAcquisitionStatusHandler({
  db: prisma,
  appOrigin: serverEnv.APP_ORIGIN,
  secret: parseAuthEnv(process.env).BETTER_AUTH_SECRET,
  getSession: (headers) =>
    auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
});
