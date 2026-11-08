import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isPublicLocale } from "../../../seo/public-pages";
import { WorkspaceShell } from "../../../components/visual/workspace-shell";
export default async function AppWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return <WorkspaceShell locale={locale}>{children}</WorkspaceShell>;
}
