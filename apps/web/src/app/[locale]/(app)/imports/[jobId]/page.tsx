import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ImportDetail } from "../../../../../components/imports/import-detail";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en"; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  return <ImportDetail locale={locale} jobId={jobId} />;
}
