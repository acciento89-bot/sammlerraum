import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AuthPanel } from "../../../components/auth/auth-panel";
import { auth } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await auth.api.getSession({ headers: await headers() }))
    redirect(`/${locale}/account/profile`);
  return <AuthPanel locale={locale} mode="register" />;
}
