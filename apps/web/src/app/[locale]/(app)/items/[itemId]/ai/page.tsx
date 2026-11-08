import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { prisma } from "@sammlerraum/db/client";
import { AIIdSchema } from "@sammlerraum/contracts/ai";
import { auth } from "../../../../../../lib/auth";
import { AnalysisCapture } from "../../../../../../components/ai/analysis-review";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false } };
export default async function AIPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; itemId: string }>;
}) {
  const { locale, itemId: input } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const id = AIIdSchema.safeParse(input);
  if (!id.success) notFound();
  const item = await prisma.collectibleItem.findFirst({
    where: {
      id: id.data,
      ownerId: session.user.id,
      deletedAt: null,
      collection: { deletedAt: null },
    },
    select: { id: true },
  });
  if (!item) notFound();
  return (
    <AnalysisCapture
      key={`${session.user.id}:${item.id}`}
      actor={session.user.id}
      locale={locale}
      itemId={item.id}
    />
  );
}
