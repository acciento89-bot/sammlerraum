import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { CollectionsManager } from "../../../../../components/collections/collections-manager";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CollectionsPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <CollectionsManager locale={locale} />;
}
