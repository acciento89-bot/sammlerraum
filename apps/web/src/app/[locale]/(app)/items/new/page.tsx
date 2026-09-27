import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ItemForm } from "../../../../../components/items/item-form";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<{ collectionId?: string }>;
}) {
  const { locale } = await params;
  const { collectionId } = await searchParams;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <ItemForm initialCollectionId={collectionId ?? ""} locale={locale} />;
}
