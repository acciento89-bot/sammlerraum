import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MembersManager } from "../../../../../../components/sharing/members-manager";
import { auth } from "../../../../../../lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function MembersPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; collectionId: string }>;
}) {
  const { locale, collectionId } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <MembersManager locale={locale} collectionId={collectionId} userId={session.user.id} />;
}
