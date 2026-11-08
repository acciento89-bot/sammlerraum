import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "../../../../lib/auth";
import { PersonalMilestoneManager } from "../../../../components/dashboard/personal-milestone-manager";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function PersonalMilestonesPage({
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
  return (
    <PersonalMilestoneManager
      key={`${session.user.id}:milestones`}
      actor={session.user.id}
      locale={locale}
    />
  );
}
