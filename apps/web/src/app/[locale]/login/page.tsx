import { invitationReturnPath } from "../../../components/auth/invitation-return-path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthPanel } from "../../../components/auth/auth-panel";
import { auth } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await auth.api.getSession({ headers: await headers() }))
    redirect(invitationReturnPath((await searchParams)?.returnTo, locale));
  return (
    <Suspense>
      <AuthPanel locale={locale} mode="login" />
    </Suspense>
  );
}
