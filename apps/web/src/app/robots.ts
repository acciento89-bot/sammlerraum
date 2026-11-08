import { buildRobots } from "../seo/sitemap";
import { siteOrigin } from "../seo/page-metadata";
export const dynamic = "force-dynamic";
export default function robots() {
  return buildRobots(siteOrigin().origin);
}
