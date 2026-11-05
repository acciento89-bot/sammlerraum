import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "../../../../lib/auth";
import { SavedSearchList } from "../../../../components/search/saved-search-list";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function CollectorSavedSearchList({
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
  return <SavedSearchList key={session.user.id} locale={locale} actor={session.user.id} />;
}
