import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import qrcode from "qrcode-generator";

import { serverEnv } from "@sammlerraum/config/server";
import { prisma } from "@sammlerraum/db/client";
import {
  createLabelService,
  LabelNotFoundError,
} from "@sammlerraum/domain/locations/label-service";

import { PrintButton } from "../../../../../../components/locations/print-button";
import { auth } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LabelPage({
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
  let label;
  try {
    label = await service.getPrintableLabel(locationId);
  } catch (error) {
    if (error instanceof LabelNotFoundError) notFound();
    throw error;
  }
  const code = qrcode(0, "M");
  code.addData(label.url);
  code.make();
  const qr = code.createDataURL(8, 4);
  const t = await getTranslations({ locale, namespace: "LocationLabel" });
  return (
    <section className="management-shell label-page">
      <div className="label-controls">
        <Link href={`/${locale}/locations/${locationId}`}>{t("back")}</Link>
        <PrintButton label={t("print")} />
      </div>
      <div className="printable-label" aria-label={t("labelFor", { name: label.name })}>
        <img src={qr} alt={t("qrAlt", { name: label.name })} width="400" height="400" />
        <h1>{label.name}</h1>
        <p>{t("shortCode", { code: label.shortCode })}</p>
      </div>
    </section>
  );
}
