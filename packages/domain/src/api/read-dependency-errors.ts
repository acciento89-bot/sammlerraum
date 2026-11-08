export function errorCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 5) return;
  const e = error as Record<string, unknown>;
  for (const key of ["code", "originalCode"])
    if (
      typeof e[key] === "string" &&
      [
        "40001",
        "40P01",
        "57014",
        "55P03",
        "P1001",
        "P1002",
        "P1008",
        "P1017",
        "P2028",
        "P2024",
        "P2034",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "ECONNRESET",
        "ENOTFOUND",
        "08006",
        "25P04",
      ].includes(e[key])
    )
      return e[key];
  // These are the connection causes emitted by the installed PostgreSQL adapter.
  if (
    typeof e.kind === "string" &&
    ["DatabaseNotReachable", "ConnectionClosed", "SocketTimeout"].includes(e.kind)
  )
    return e.kind;
  for (const key of ["meta", "cause", "driverAdapterError"]) {
    const code = errorCode(e[key], depth + 1);
    if (code) return code;
  }
}
export function isReadDependencyFailure(error: unknown): boolean {
  return errorCode(error) !== undefined;
}
export function isReadSerializationFailure(error: unknown): boolean {
  return errorCode(error) === "40001";
}
