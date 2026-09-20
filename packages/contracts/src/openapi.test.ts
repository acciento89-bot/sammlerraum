import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi";

describe("OpenAPI document", () => {
  it("contains the account session endpoint", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/api/v1/account/sessions"]).toBeDefined();
  });

  it("documents the account session validation error envelope", () => {
    const document = buildOpenApiDocument();
    const sessionPath = document.paths["/api/v1/account/sessions"] as {
      delete: {
        responses: {
          "400": { content: { "application/json": { schema: unknown } } };
        };
      };
    };

    expect(sessionPath.delete.responses["400"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ApiValidationError",
    });
    expect(document.components.schemas.ApiValidationError).toBeDefined();
  });
});
