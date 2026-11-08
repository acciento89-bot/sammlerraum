import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi";

describe("OpenAPI document", () => {
  it("contains the account session endpoint", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/api/v1/account/sessions"]).toBeDefined();
  });

  it("documents both malformed JSON and structured validation errors for session deletion", () => {
    const document = buildOpenApiDocument();
    const sessionPath = document.paths["/api/v1/account/sessions"] as {
      get: {
        responses: {
          "500": { content: { "application/json": { schema: unknown } } };
        };
      };
      delete: {
        responses: {
          "400": { content: { "application/json": { schema: unknown } } };
          "500": { content: { "application/json": { schema: unknown } } };
        };
      };
    };

    expect(sessionPath.delete.responses["400"].content["application/json"].schema).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/ApiError" },
        { $ref: "#/components/schemas/ApiValidationError" },
      ],
    });
    expect(sessionPath.get.responses["500"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ApiError",
    });
    expect(sessionPath.delete.responses["500"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ApiError",
    });
    expect(document.components.schemas.ApiValidationError).toBeDefined();
  });

  it("matches Better Auth session cookie names for HTTP and HTTPS origins", () => {
    const buildForOrigin = buildOpenApiDocument as (options: {
      appOrigin: string;
    }) => ReturnType<typeof buildOpenApiDocument>;
    const cookieName = (appOrigin: string) => {
      const document = buildForOrigin({ appOrigin });
      const scheme = document.components.securitySchemes.sessionCookie as { name: string };
      return scheme.name;
    };

    expect(cookieName("http://localhost:3000")).toBe("better-auth.session_token");
    expect(cookieName("https://sammlerraum.example")).toBe("__Secure-better-auth.session_token");
  });
});
