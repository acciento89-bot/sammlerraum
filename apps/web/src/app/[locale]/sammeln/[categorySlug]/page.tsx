import {
  categoryRouteMetadata,
  renderCategoryRoute,
} from "../../../../components/marketing/category-page";
export const dynamic = "force-dynamic";
export function generateMetadata(props: Parameters<typeof categoryRouteMetadata>[0]) {
  return categoryRouteMetadata(props, "de");
}
export default function Page(props: Parameters<typeof renderCategoryRoute>[0]) {
  return renderCategoryRoute(props, "de");
}
