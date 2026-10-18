import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  createLabelService,
  LabelNotFoundError,
} from "@sammlerraum/domain/locations/label-service";
import { prisma } from "@sammlerraum/db/client";
import { serverEnv } from "@sammlerraum/config/server";

import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LocationPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; locationId: string }>;
}) {
  const { locale, locationId } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);

  const service = createLabelService(prisma, session.user.id, serverEnv.APP_ORIGIN);
  let contents;
  try {
    contents = await service.getLocationContentsForActor(locationId);
  } catch (error) {
    if (error instanceof LabelNotFoundError) notFound();
    throw error;
  }
  const t = await getTranslations({ locale, namespace: "LocationLabel" });
  return (
    <section className="management-shell location-view">
      <h1>{contents.location.name}</h1>
      <p>
        <Link href={`/${locale}/locations/${locationId}/label`}>{t("printLabel")}</Link>
      </p>
      <h2>{t("childLocations")}</h2>
      {contents.childLocations.length ? (
        <ul>
          {contents.childLocations.map((child) => (
            <li key={child.id}>
              <Link href={`/${locale}/locations/${child.id}`}>{child.name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noChildLocations")}</p>
      )}
      <h2>{t("items")}</h2>
      {contents.items.length ? (
        <ul>
          {contents.items.map((item) => (
            <li key={item.id}>
              <Link href={`/${locale}/items/${item.id}`}>{item.title}</Link> · {item.quantity}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noItems")}</p>
      )}
    </section>
  );
}
