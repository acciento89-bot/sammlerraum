import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ResolveShareSchema } from "@sammlerraum/contracts/sharing";
import { ShareViewer } from "../../../components/sharing/share-viewer";
import { selectLocale } from "../../../i18n/routing";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params,
    access = ResolveShareSchema.safeParse(token.length === 43 ? { token } : { shareId: token });
  if (!access.success) notFound();
  const h = await headers(),
    cookie = h.get("cookie")?.match(/(?:^|;\s*)NEXT_LOCALE=(de|en)(?:;|$)/)?.[1];
  return <ShareViewer identifier={token} locale={selectLocale(cookie, h.get("accept-language"))} />;
}
