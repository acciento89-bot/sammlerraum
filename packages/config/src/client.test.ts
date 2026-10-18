import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ORIGIN = "http://localhost:3000";
  vi.resetModules();
});

describe("clientEnv", () => {
  it("exposes only the normalized public application origin", async () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://example.com/";
    const { clientEnv } = await import("./client");

    expect(clientEnv).toEqual({ APP_ORIGIN: "https://example.com" });
    expect(Object.keys(clientEnv)).toEqual(["APP_ORIGIN"]);
    expect(JSON.stringify(clientEnv)).not.toContain("DATABASE_URL");
  });

  it.each([
    "ftp://example.com",
    "http://user:pass@example.com",
    "https://example.com/app",
    "https://example.com?preview=true",
    "https://example.com#preview",
  ])("rejects a non-origin public URL: %s", async (value) => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = value;

    await expect(import("./client")).rejects.toThrow();
  });
});
