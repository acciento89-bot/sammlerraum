import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi";
describe("owner-only search indexing contract is documented", () => {
  it("documents its authenticated read/write boundary, strict input, conflict and private no-store response", () => {
    const doc = buildOpenApiDocument({ appOrigin: "https://sammlerraum.de" }),
      path = doc.paths["/api/v1/account/search-indexing"];
    expect(path).toMatchObject({
      get: { security: [{ sessionCookie: [] }] },
      put: {
        security: [{ sessionCookie: [] }],
        responses: { "409": expect.anything(), "403": expect.anything(), "404": expect.anything() },
      },
    });
    const schema = doc.components.schemas.SearchPreferenceInput as {
      additionalProperties: unknown;
      properties: Record<string, unknown>;
    };
    expect(schema?.additionalProperties).toBe(false);
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
      "publicLocale",
      "revision",
      "searchEngineIndexingEnabled",
    ]);
    expect(JSON.stringify(path)).toContain("no-store");
    expect(path).toMatchObject({
      put: {
        responses: {
          "400": {
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/ApiError" },
                    { $ref: "#/components/schemas/ApiValidationError" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  });
});
