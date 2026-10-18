import { prisma } from "@sammlerraum/db/client";
import { ValuationIdSchema } from "@sammlerraum/contracts/valuations";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "../../../../../../lib/auth";
import { ValuationPage } from "../../../../../../components/valuations/valuation-page";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ValuesPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; itemId: string }>;
}) {
  const { locale, itemId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Valuations" });
  if (!ValuationIdSchema.safeParse(itemId).success) notFound();
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session)
    return (
      <section className="management-shell">
        <h1>{t("title")}</h1>
        <p>{t("signIn")}</p>
        <Link href={`/${locale}/login`}>{t("login")}</Link>
      </section>
    );
  const item = await prisma.collectibleItem.findFirst({
    where: {
      id: itemId,
      ownerId: session.user.id,
      deletedAt: null,
      collection: { ownerId: session.user.id, deletedAt: null },
    },
    select: { id: true, title: true },
  });
  if (!item) notFound();
  return (
    <ValuationPage
      key={`${item.id}:${locale}`}
      itemId={item.id}
      title={item.title}
      locale={locale}
    />
  );
}
