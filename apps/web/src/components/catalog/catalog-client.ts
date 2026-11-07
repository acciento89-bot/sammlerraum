export type Locale = "de" | "en";
export type Copy = (key: string) => string;
export class CatalogRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export async function catalogRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new CatalogRequestError(value?.error?.code ?? "UNKNOWN", response.status);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export function catalogError(error: unknown, t: Copy): string {
  const code = error instanceof CatalogRequestError ? error.code : "UNKNOWN";
  const known = [
    "ITEM_INACTIVE",
    "CATALOG_UNLINK_REQUIRED",
    "CONDITION_CLEAR_REQUIRED",
    "CONDITION_INACTIVE",
    "ITEM_CATALOG_CATEGORY_MISMATCH",
    "ITEM_CATALOG_VARIANT_INACTIVE",
    "ITEM_CATALOG_RETRY_EXHAUSTED",
    "GRADING_QUANTITY_REQUIRED",
    "GRADING_REQUIRES_SINGLE_ITEM",
    "GRADING_CERTIFICATE_CONFLICT",
    "GRADING_LIMIT_EXCEEDED",
    "CATALOG_PROPOSAL_CONFLICT",
    "CATALOG_PROPOSAL_ALREADY_DECIDED",
    "CATALOG_PROPOSAL_LIMIT_EXCEEDED",
    "CONFLICT",
    "FORBIDDEN",
    "NOT_FOUND",
    "UNAUTHORIZED",
    "VALIDATION_ERROR",
  ];
  return t(`errors.${known.includes(code) ? code : "UNKNOWN"}`);
}
export function authoredTitle(
  text: {
    language: string;
    title: string;
    translations: Array<{ language: string; title: string }>;
  },
  locale: Locale,
) {
  return text.language === locale
    ? text.title
    : (text.translations.find((row) => row.language === locale)?.title ?? text.title);
}
