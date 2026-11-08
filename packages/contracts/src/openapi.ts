import {
  SearchPreferenceInput,
  SearchPreferenceReadResponse,
  SearchPreferenceWriteResponse,
} from "./search-indexing";
import { z } from "zod";

import { PublicProfileSchema } from "./profile";

type OpenApiSchemaMetadata = {
  id: string;
  description: string;
};

const schemaRegistry = z.registry<OpenApiSchemaMetadata>();

PublicProfileSchema.register(schemaRegistry, {
  id: "PublicProfile",
  description: "Public profile fields safe for unauthenticated clients.",
});

const ApiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
    }),
  })
  .register(schemaRegistry, {
    id: "ApiError",
    description: "Stable client-safe API error envelope.",
  });

const ApiValidationErrorSchema = ApiErrorSchema.extend({
  validation: z.object({
    issues: z.array(
      z.object({
        location: z.enum(["request", "field"]),
        code: z.string(),
      }),
    ),
    truncated: z.boolean(),
  }),
}).register(schemaRegistry, {
  id: "ApiValidationError",
  description: "Client-safe request validation error envelope.",
});

const AccountSessionSchema = z
  .object({
    id: z.string(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    userAgent: z.string().nullable(),
    current: z.boolean(),
  })
  .register(schemaRegistry, {
    id: "AccountSession",
    description: "Sanitized metadata for one active account session.",
  });

const AccountSessionListSchema = z
  .object({ sessions: z.array(AccountSessionSchema) })
  .register(schemaRegistry, {
    id: "AccountSessionList",
    description: "Active sessions owned by the authenticated account.",
  });

const RevokeAccountSessionSchema = z
  .object({ sessionId: z.string().min(1) })
  .register(schemaRegistry, {
    id: "RevokeAccountSession",
    description: "Stable identifier of the owned session to revoke.",
  });

SearchPreferenceInput.register(schemaRegistry, {
  id: "SearchPreferenceInput",
  description:
    "Explicit owner search indexing consent, preferred public locale and expected revision. No client owner identity.",
});
SearchPreferenceReadResponse.register(schemaRegistry, {
  id: "SearchPreferenceReadResponse",
  description: "Own preference, or null before profile creation. Never a public profile field.",
});
SearchPreferenceWriteResponse.register(schemaRegistry, {
  id: "SearchPreferenceWriteResponse",
  description: "Updated own preference with incremented revision.",
});

const schemaReference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorResponse = (description: string, schema = "ApiError") => ({
  description,
  content: { "application/json": { schema: schemaReference(schema) } },
});

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

type OpenApiDocumentOptions = {
  appOrigin?: string;
};

export function buildOpenApiDocument({
  appOrigin = "https://example.invalid",
}: OpenApiDocumentOptions = {}): OpenApiDocument {
  const { schemas } = z.toJSONSchema(schemaRegistry, {
    target: "draft-2020-12",
    uri: (id) => `#/components/schemas/${id}`,
  });
  const secureCookiePrefix = new URL(appOrigin).protocol === "https:" ? "__Secure-" : "";

  return {
    openapi: "3.1.0",
    info: { title: "Sammlerraum API", version: "1.0.0" },
    paths: {
      "/api/v1/account/search-indexing": {
        get: {
          operationId: "readOwnSearchIndexingPreference",
          summary: "Read the fresh authenticated owner's private search preference",
          security: [{ sessionCookie: [] }],
          responses: {
            "200": {
              description: "Own preference",
              headers: { "Cache-Control": { schema: { type: "string", const: "no-store" } } },
              content: {
                "application/json": { schema: schemaReference("SearchPreferenceReadResponse") },
              },
            },
            "401": errorResponse("Authentication required"),
            "500": errorResponse("Unexpected server error"),
          },
        },
        put: {
          operationId: "updateOwnSearchIndexingPreference",
          summary:
            "Save explicit owner consent with expected revision; privacy controls have no paid-plan gate",
          security: [{ sessionCookie: [] }],
          parameters: [
            {
              in: "header",
              name: "Origin",
              required: true,
              schema: { type: "string", enum: [new URL(appOrigin).origin] },
            },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaReference("SearchPreferenceInput") } },
          },
          responses: {
            "200": {
              description: "Preference saved",
              headers: { "Cache-Control": { schema: { type: "string", const: "no-store" } } },
              content: {
                "application/json": { schema: schemaReference("SearchPreferenceWriteResponse") },
              },
            },
            "400": {
              description: "Malformed JSON or invalid strict input",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [schemaReference("ApiError"), schemaReference("ApiValidationError")],
                  },
                },
              },
            },
            "401": errorResponse("Authentication required"),
            "403": errorResponse("Exact Origin required"),
            "404": errorResponse("Own profile not found"),
            "409": errorResponse("Preference changed; reload and explicitly review consent"),
            "500": errorResponse("Unexpected server error"),
          },
        },
      },
      "/api/v1/account/sessions": {
        get: {
          operationId: "listAccountSessions",
          summary: "List active account sessions",
          security: [{ sessionCookie: [] }],
          responses: {
            "200": {
              description: "Active sessions",
              content: {
                "application/json": { schema: schemaReference("AccountSessionList") },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: schemaReference("ApiError") } },
            },
            "500": errorResponse("Unexpected server error"),
          },
        },
        delete: {
          operationId: "revokeAccountSession",
          summary: "Revoke an owned account session",
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: schemaReference("RevokeAccountSession") },
            },
          },
          responses: {
            "204": { description: "Session revoked" },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [schemaReference("ApiError"), schemaReference("ApiValidationError")],
                  },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: schemaReference("ApiError") } },
            },
            "403": {
              description: "Cross-origin request rejected",
              content: { "application/json": { schema: schemaReference("ApiError") } },
            },
            "404": {
              description: "Session not found",
              content: { "application/json": { schema: schemaReference("ApiError") } },
            },
            "500": errorResponse("Unexpected server error"),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: `${secureCookiePrefix}better-auth.session_token`,
        },
      },
      schemas,
    },
  };
}
