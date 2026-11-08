import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "@sammlerraum/db/client";
export async function communityPageSession(locale: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const grant = await prisma.applicationRoleGrant.findUnique({
    where: { userId: session.user.id },
    select: { role: true },
  });
  return {
    viewerId: session.user.id,
    moderator: grant?.role === "MODERATOR" || grant?.role === "ADMIN",
  };
}
