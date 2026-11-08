import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { SharedSearchHub } from "../../../../components/search/shared-search-hub";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function SharedSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<{ collection?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const requested = z.uuid().safeParse((await searchParams).collection);
  return (
    <SharedSearchHub
      key={session.user.id}
      locale={locale}
      initialCollection={requested.success ? requested.data : undefined}
    />
  );
}
