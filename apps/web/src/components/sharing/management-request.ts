export class ManagementProblem extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function managementRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = (await response.json()) as T & { error?: { code?: string } };
  if (!response.ok) throw new ManagementProblem(value.error?.code ?? "UNEXPECTED");
  return value;
}
export function managementError(problem: unknown, t: (key: string) => string) {
  const code = problem instanceof ManagementProblem ? problem.code : "";
  if (code === "MEMBERSHIP_TRANSFER_BLOCKED") return t("transferBlocked");
  return t(
    code.includes("CONFLICT")
      ? "conflict"
      : code.endsWith("NOT_FOUND") || code === "FORBIDDEN" || code.endsWith("FORBIDDEN")
        ? "denied"
        : code === "UNAUTHORIZED"
          ? "signInAgain"
          : "error",
  );
}
