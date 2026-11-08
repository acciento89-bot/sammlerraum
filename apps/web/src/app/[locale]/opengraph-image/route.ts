import { socialImage } from "../../../components/seo/social-image";
import { buildItemOgModel } from "../../../seo/social-preview";
import { isPublicLocale } from "../../../seo/public-pages";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return new Response("Not found", { status: 404 });
  return socialImage(buildItemOgModel(null, locale));
}
