import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AuditManager } from "../../../../components/sharing/audit-manager";
import { auth } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<{ resourceType?: string; resourceId?: string }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return (
    <AuditManager
      locale={locale}
      resourceType={typeof query.resourceType === "string" ? query.resourceType : ""}
      resourceId={typeof query.resourceId === "string" ? query.resourceId : ""}
    />
  );
}
