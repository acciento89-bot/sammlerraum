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
