import { createProfileService } from "@sammlerraum/domain/identity/profile-service";
import { prisma } from "@sammlerraum/db/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountNav } from "../../../../../components/account/account-nav";
import { ProfileForm } from "../../../../../components/account/profile-form";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const [profile, t] = await Promise.all([
    createProfileService(prisma).getOwnProfile(session.user.id),
    getTranslations("Profile"),
  ]);
  return (
    <section className="account-shell">
      <AccountNav locale={locale} />
      <div className="settings-card">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="form-intro">{t("intro")}</p>
        <ProfileForm profile={profile} />
      </div>
    </section>
  );
}
