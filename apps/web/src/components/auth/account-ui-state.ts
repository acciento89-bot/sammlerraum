export function authView(token: string | null, resetComplete: boolean): "login" | "reset" {
  return token && !resetComplete ? "reset" : "login";
}

export function classifySecurityFailure(
  code: string,
): "reauthenticate" | "recovery-required" | "error" {
  if (code === "SESSION_NOT_FRESH") return "reauthenticate";
  if (code === "RECOVERY_METHOD_REQUIRED") return "recovery-required";
  return "error";
}

export function remainingFreshMilliseconds(freshUntil: number, now = Date.now()): number {
  return Math.max(0, freshUntil - now);
}

export function providerTranslationKey(provider: string) {
  if (provider === "credential") return "providerPassword" as const;
  if (provider === "google") return "providerGoogle" as const;
  return "providerApple" as const;
}

export async function finishReauthentication(
  authenticate: () => Promise<{ error: unknown | null }>,
  reloadSessions: () => Promise<void>,
  now = Date.now(),
): Promise<number | null> {
  const result = await authenticate();
  if (result.error) return null;
  await reloadSessions();
  return now + 5 * 60_000;
}

export function inPlacePasswordCredentials(email: string, password: string) {
  return { email, password };
}

export function profileFeedback(ok: boolean) {
  return ok
    ? ({ kind: "success", role: "status" } as const)
    : ({ kind: "error", role: "alert" } as const);
}
