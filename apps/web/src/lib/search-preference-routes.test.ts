import { describe, expect, it, vi } from "vitest";
import { SearchPreferenceError } from "@sammlerraum/domain/seo/search-preference-service";
import { createSearchPreferenceHandlers } from "./search-preference-routes";
const origin = "https://example.test",
  value = { searchEngineIndexingEnabled: true, publicLocale: "en", revision: 0 };
function fixture(session: { user: { id: string } } | null = { user: { id: "trusted-owner" } }) {
  const service = {
    getOwn: vi.fn().mockResolvedValue(value),
    updateOwn: vi.fn().mockResolvedValue({ ...value, revision: 1 }),
  };
  return {
    service,
    handlers: createSearchPreferenceHandlers({
      getSession: async () => session,
      service,
      appOrigin: origin,
    }),
  };
}
function request(body: unknown = value, suppliedOrigin: string | null = origin) {
  return new Request(origin + "/api/v1/account/search-indexing", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(suppliedOrigin ? { origin: suppliedOrigin } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe("private search preference API", () => {
  it("reads only the session owner's preference without caching", async () => {
    const f = fixture(),
      res = await f.handlers.GET(new Request(origin));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(f.service.getOwn).toHaveBeenCalledWith("trusted-owner");
  });
  it("uses fresh authenticated owner identity and never accepts a body ownerId", async () => {
    const f = fixture();
    expect((await f.handlers.PUT(request(value))).status).toBe(200);
    expect(f.service.updateOwn).toHaveBeenCalledWith("trusted-owner", value);
    expect((await f.handlers.PUT(request({ ...value, userId: "other" }))).status).toBe(400);
    expect(f.service.updateOwn).toHaveBeenCalledTimes(1);
  });
  it("rejects guests, missing origin and foreign origins before writes", async () => {
    const guest = fixture(null);
    expect((await guest.handlers.GET(new Request(origin))).status).toBe(401);
    expect((await guest.handlers.PUT(request())).status).toBe(401);
    const f = fixture();
    for (const o of [null, "https://evil.test"])
      expect((await f.handlers.PUT(request(value, o))).status).toBe(403);
    expect(f.service.updateOwn).not.toHaveBeenCalled();
  });
  it.each(["CONFLICT", "NOT_FOUND"] as const)(
    "maps %s without leaking private state",
    async (code) => {
      const f = fixture();
      f.service.updateOwn.mockRejectedValue(new SearchPreferenceError(code));
      const res = await f.handlers.PUT(request());
      expect(res.status).toBe(code === "CONFLICT" ? 409 : 404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );
  it("rejects malformed JSON and invalid fields", async () => {
    const f = fixture();
    expect(
      (await f.handlers.PUT(new Request(origin, { method: "PUT", headers: { origin }, body: "{" })))
        .status,
    ).toBe(400);
    for (const input of [
      { ...value, searchEngineIndexingEnabled: "true" },
      { ...value, publicLocale: "fr" },
    ])
      expect((await f.handlers.PUT(request(input))).status).toBe(400);
    expect(f.service.updateOwn).not.toHaveBeenCalled();
  });
});
