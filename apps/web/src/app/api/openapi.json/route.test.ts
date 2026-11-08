import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("OpenAPI route", () => {
  it("publishes the generated document without caching it", async () => {
    const response = GET();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      openapi: "3.1.0",
      paths: { "/api/v1/account/sessions": expect.any(Object) },
    });
  });
});
