import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ProposalManager } from "../../../../../components/catalog/proposal-manager";
import { auth } from "../../../../../lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: "de" | "en" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <ProposalManager locale={locale} review />;
}
