import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ItemForm } from "../../../../../../components/items/item-form";
import { auth } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ItemPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; itemId: string }>;
}) {
  const { locale, itemId } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <ItemForm itemId={itemId} locale={locale} />;
}
