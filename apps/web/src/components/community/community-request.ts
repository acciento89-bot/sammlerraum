export class CommunityProblem extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CommunityProblem";
  }
}
export async function communityRequest<T>(
  url: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    method: options.method ?? "GET",
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }),
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new CommunityProblem("UNAVAILABLE");
  }
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } })?.error?.code;
    throw new CommunityProblem(
      typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code) ? code : "UNAVAILABLE",
    );
  }
  return value as T;
}
export function communityError(problem: unknown, t: (key: string) => string) {
  const code = problem instanceof CommunityProblem ? problem.code : "";
  return t(
    code === "UNAUTHORIZED"
      ? "signInAgain"
      : code === "COMMENTS_DISABLED"
        ? "commentsClosed"
        : code === "BLOCKED_INTERACTION"
          ? "blockedInteraction"
          : code.includes("CONFLICT")
            ? "conflict"
            : code.endsWith("NOT_FOUND") || code === "FORBIDDEN" || code.endsWith("FORBIDDEN")
              ? "denied"
              : code.includes("INVALID") || code === "VALIDATION_ERROR"
                ? "invalid"
                : "error",
  );
}
