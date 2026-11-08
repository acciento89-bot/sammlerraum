import { socialImage } from "../../../../../components/seo/social-image";
import { buildCategoryOgModel } from "../../../../../seo/social-preview";
import { findCategory } from "../../../../../seo/category-pages";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; categorySlug: string }> },
) {
  const { locale, categorySlug } = await params;
  const category = locale === "en" ? findCategory("en", categorySlug) : null;
  if (!category) return new Response("Not found", { status: 404 });
  return socialImage(buildCategoryOgModel(category, "en"));
}
