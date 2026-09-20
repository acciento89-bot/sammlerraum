import { describe, expect, it, vi } from "vitest";

import { createProfileRouteHandlers } from "./account-profile-routes";

describe("own profile route", () => {
  it("upserts only for the authenticated user and exact origin", async () => {
    const upsertOwnProfile = vi.fn().mockResolvedValue({
      handle: "sammler",
      displayName: "Sammler",
      bio: null,
      avatarAssetId: null,
    });
    const handlers = createProfileRouteHandlers({
      getSession: vi.fn().mockResolvedValue({ user: { id: "trusted-user" } }),
      service: { getOwnProfile: vi.fn(), upsertOwnProfile },
      appOrigin: "https://example.test",
    });
    const response = await handlers.PUT(new Request("https://example.test/api/v1/account/profile", {
      method: "PUT",
      headers: { origin: "https://example.test", "content-type": "application/json" },
      body: JSON.stringify({ handle: "sammler", displayName: "Sammler", bio: null, avatarAssetId: null, userId: "attacker" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upsertOwnProfile).toHaveBeenCalledWith("trusted-user", {
      handle: "sammler", displayName: "Sammler", bio: null, avatarAssetId: null,
    });
  });
});
