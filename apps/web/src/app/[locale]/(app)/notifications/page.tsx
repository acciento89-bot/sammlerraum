import { setRequestLocale } from "next-intl/server";
import { communityPageSession } from "../../../../lib/community-page-session";
import { NotificationCenter } from "../../../../components/community/notification-center";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await communityPageSession(locale);
  return <NotificationCenter locale={locale} moderator={viewer.moderator} />;
}
