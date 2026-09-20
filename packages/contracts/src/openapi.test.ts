import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi";

describe("OpenAPI document", () => {
  it("contains the account session endpoint", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/api/v1/account/sessions"]).toBeDefined();
  });
});
