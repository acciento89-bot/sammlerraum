import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("locale preference proxy", () => {
  it("does not change locale preference for a Next link prefetch", () => {
    const request = new NextRequest("http://localhost:3000/en", {
      headers: {
        cookie: "NEXT_LOCALE=de",
        "next-router-prefetch": "1",
        rsc: "1",
      },
    });
    const response = proxy(request);
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });

  it("does not change locale preference for a browser prefetch", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/en", {
        headers: { cookie: "NEXT_LOCALE=de", purpose: "prefetch" },
      }),
    );
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });

  it("persists a deliberate locale navigation", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/en", {
        headers: { cookie: "NEXT_LOCALE=de" },
      }),
    );
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
  });
});
