export class ScopedSearchHttpError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
/** Ephemeral request body only: no URL/query history, storage or credential caches. */
export async function scopedRequest<T>(
  path: string,
  body: unknown | undefined,
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
  },
  signal?: AbortSignal,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "code" in data.error &&
      typeof data.error.code === "string"
        ? data.error.code
        : "SEARCH_UNAVAILABLE";
    throw new ScopedSearchHttpError(code);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ScopedSearchHttpError("SEARCH_INVARIANT");
  return parsed.data;
}
