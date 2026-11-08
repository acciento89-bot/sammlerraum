import { serializeJsonLd } from "../../seo/structured-data";
export function StructuredData({ value }: { value: unknown }) {
  return value == null ? null : (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }}
    />
  );
}
