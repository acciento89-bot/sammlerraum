import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { WishlistIdSchema } from "@sammlerraum/contracts/wishlist";
import { communityPageSession } from "../../../../lib/community-page-session";
import { WishlistWorkspace } from "../../../../components/community/wishlist-workspace";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function WishlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<{ itemId?: string }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  setRequestLocale(locale);
  const viewer = await communityPageSession(locale);
  if (query.itemId !== undefined && !WishlistIdSchema.safeParse(query.itemId).success) notFound();
  return (
    <WishlistWorkspace
      locale={locale}
      moderator={viewer.moderator}
      {...(query.itemId ? { itemId: query.itemId } : {})}
    />
  );
}
