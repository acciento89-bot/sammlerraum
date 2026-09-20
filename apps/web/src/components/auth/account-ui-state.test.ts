import { describe, expect, it, vi } from "vitest";

import {
  authView,
  classifySecurityFailure,
  finishReauthentication,
  profileFeedback,
  providerTranslationKey,
  remainingFreshMilliseconds,
} from "./account-ui-state";

describe("account UI state", () => {
  it("leaves reset mode immediately after a successful password reset", () => {
    expect(authView("reset-token", false)).toBe("reset");
    expect(authView("reset-token", true)).toBe("login");
  });

  it("distinguishes stale authentication from recovery and generic failures", () => {
    expect(classifySecurityFailure("SESSION_NOT_FRESH")).toBe("reauthenticate");
    expect(classifySecurityFailure("RECOVERY_METHOD_REQUIRED")).toBe("recovery-required");
    expect(classifySecurityFailure("INTERNAL_ERROR")).toBe("error");
  });

  it("expires destructive controls at the server freshness deadline", () => {
    expect(remainingFreshMilliseconds(10_000, 9_000)).toBe(1_000);
    expect(remainingFreshMilliseconds(10_000, 10_000)).toBe(0);
  });

  it("selects translation keys instead of rendering provider ids", () => {
    expect(providerTranslationKey("credential")).toBe("providerPassword");
    expect(providerTranslationKey("google")).toBe("providerGoogle");
    expect(providerTranslationKey("apple")).toBe("providerApple");
  });

  it("reloads sessions and establishes a new deadline after reauthentication", async () => {
    const reloadSessions = vi.fn().mockResolvedValue(undefined);
    await expect(
      finishReauthentication(async () => ({ error: null }), reloadSessions, 10_000),
    ).resolves.toBe(310_000);
    expect(reloadSessions).toHaveBeenCalledOnce();
  });

  it("presents profile failures as alerts instead of success statuses", () => {
    expect(profileFeedback(false)).toEqual({ kind: "error", role: "alert" });
    expect(profileFeedback(true)).toEqual({ kind: "success", role: "status" });
  });
});
