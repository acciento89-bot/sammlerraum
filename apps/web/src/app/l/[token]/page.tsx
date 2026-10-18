import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { serverEnv } from "@sammlerraum/config/server";
import { prisma } from "@sammlerraum/db/client";
import {
  createLabelService,
  LabelNotFoundError,
} from "@sammlerraum/domain/locations/label-service";

import { selectLocale } from "../../../i18n/routing";
import { auth } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const cookieLocale = requestHeaders
    .get("cookie")
    ?.match(/(?:^|;\s*)NEXT_LOCALE=(de|en)(?:;|$)/)?.[1];
  const locale = selectLocale(cookieLocale, requestHeaders.get("accept-language"));
  if (!session) redirect(`/${locale}/login`);

  const service = createLabelService(prisma, session.user.id, serverEnv.APP_ORIGIN);
  try {
    const { locationId } = await service.resolveLabelToken((await params).token);
    redirect(`/${locale}/locations/${locationId}`);
  } catch (error) {
    if (error instanceof LabelNotFoundError) notFound();
    throw error;
  }
}
