/** Existing immutable snapshot byte format. Callers retain their own error boundary. */
export function serializeCatalogValue(value: unknown, invalid: () => never): string {
  if (Array.isArray(value))
    return `[${value.map((item) => serializeCatalogValue(item, invalid)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${serializeCatalogValue(item, invalid)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) invalid();
  return serialized;
}
