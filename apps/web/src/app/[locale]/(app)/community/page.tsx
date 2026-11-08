import { setRequestLocale } from "next-intl/server";
import { communityPageSession } from "../../../../lib/community-page-session";
import { CommunityFeed } from "../../../../components/community/community-feed";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await communityPageSession(locale);
  return <CommunityFeed locale={locale} {...viewer} />;
}
