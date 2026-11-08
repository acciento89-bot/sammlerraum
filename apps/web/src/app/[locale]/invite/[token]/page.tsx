import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { InvitationAcceptance } from "../../../../components/sharing/invitation-acceptance";
import { auth } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; token: string }>;
}) {
  const { locale, token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  return <InvitationAcceptance locale={locale} token={token} signedIn={Boolean(session)} />;
}
