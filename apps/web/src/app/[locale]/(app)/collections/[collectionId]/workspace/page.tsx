import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CollaborativeWorkspace } from "../../../../../../components/sharing/collaborative-workspace";
import { auth } from "../../../../../../lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function WorkspacePage({
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
  return <CollaborativeWorkspace locale={locale} collectionId={collectionId} />;
}
