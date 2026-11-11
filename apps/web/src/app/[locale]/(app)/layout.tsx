import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isPublicLocale } from "../../../seo/public-pages";
import { WorkspaceShell } from "../../../components/visual/workspace-shell";
import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { prisma } from "@sammlerraum/db/client";
export default async function AppWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { emailVerified: true, applicationRoleGrant: { select: { role: true } } },
      })
    : null;
  const administrator = Boolean(user?.emailVerified && user.applicationRoleGrant?.role === "ADMIN");
  return (
    <WorkspaceShell locale={locale} administrator={administrator}>
      {children}
    </WorkspaceShell>
  );
}
