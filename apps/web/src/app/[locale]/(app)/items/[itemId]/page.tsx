import { prisma } from "@sammlerraum/db/client";
import { createItemQuery, PublicItemQueryError } from "@sammlerraum/domain/items/item-query";
import { MediaAssetSchema } from "@sammlerraum/contracts/media";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ItemForm } from "../../../../../components/items/item-form";
import { auth } from "../../../../../lib/auth";

export const metadata = { robots: { index: false, follow: false } };

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
  if (!MediaAssetSchema.shape.id.safeParse(itemId).success) notFound();
  if (session) {
    const owned = await prisma.collectibleItem.findFirst({
      where: {
        id: itemId,
        ownerId: session.user.id,
        deletedAt: null,
        collection: { deletedAt: null },
      },
      select: { id: true },
    });
    if (owned) return <ItemForm itemId={itemId} locale={locale} />;
  }
  let item;
  try {
    item = await createItemQuery(prisma).getPublicItem(itemId);
  } catch (error) {
    if (error instanceof PublicItemQueryError) notFound();
    throw error;
  }
  // Explicit public allowlist: never serialize owner, document, filename or acquisition metadata.
  const images = await prisma.mediaLink.findMany({
    where: {
      itemId,
      purpose: "GALLERY",
      asset: { kind: "IMAGE", status: "READY", cleanupStartedAt: null },
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, assetId: true },
  });
  return (
    <section className="management-shell">
      <h1>{item.title}</h1>
      {item.publicDescription && <p>{item.publicDescription}</p>}
      <div className="media-grid">
        {images.map((image) => (
          <img
            key={image.id}
            src={`/api/v1/media/${image.assetId}/medium`}
            alt={item.title}
            width={640}
            height={480}
          />
        ))}
      </div>
    </section>
  );
}
