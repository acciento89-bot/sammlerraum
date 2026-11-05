import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "../../../../../lib/auth";
import { SavedSearchDetail } from "../../../../../components/search/saved-search-detail";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function CollectorSavedSearchDetail({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return (
    <SavedSearchDetail
      key={`${session.user.id}:${id}`}
      id={id}
      locale={locale}
      actor={session.user.id}
    />
  );
}
