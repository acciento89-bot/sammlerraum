import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { CollectionDetail } from "../../../../../components/collections/collection-detail";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CollectionPage({
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
  return <CollectionDetail collectionId={collectionId} locale={locale} />;
}
