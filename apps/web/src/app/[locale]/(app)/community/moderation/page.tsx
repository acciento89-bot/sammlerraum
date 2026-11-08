import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { communityPageSession } from "../../../../../lib/community-page-session";
import { ModerationCenter } from "../../../../../components/community/moderation-center";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ModerationPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await communityPageSession(locale);
  if (!viewer.moderator) notFound();
  return <ModerationCenter locale={locale} />;
}
