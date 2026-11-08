export async function importApi<T>(operation: string, input?: unknown): Promise<T> {
  const response = await fetch(
    `/api/v1/imports/${operation}`,
    input === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          cache: "no-store",
        },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.code ?? "IMPORT_UNAVAILABLE");
  return body as T;
}
