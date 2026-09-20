import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ApiError } from "@sammlerraum/contracts/errors";

import { apiRoute } from "./route-handler";

function executeTestRoute(
  handler: (request: Request) => Response | Promise<Response>,
  headers?: HeadersInit,
): Promise<Response> {
  return apiRoute(handler)(new Request("https://example.test/api/test", { headers }));
}

describe("apiRoute", () => {
  it("maps API errors to the exact public envelope without a stack", async () => {
    const response = await executeTestRoute(
      () => {
        throw new ApiError("FORBIDDEN", 403, "Not allowed");
      },
      { "x-request-id": "request-123" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Not allowed",
        requestId: "request-123",
      },
    });
  });

  it("hides unknown exception details behind a generic 500 response", async () => {
    const response = await executeTestRoute(() => {
      const error = new Error("database password is secret");
      error.cause = { query: "select secret_token from session" };
      throw error;
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId: expect.any(String),
      },
    });
    expect(JSON.stringify(body)).not.toContain("database password");
    expect(JSON.stringify(body)).not.toContain("secret_token");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("returns bounded non-reflective metadata for Zod validation errors", async () => {
    const submittedSecret = "submittedSecretKey";
    const customMessage = "custom validator exposed a secret";
    const response = await executeTestRoute(() => {
      z.object({
        items: z.array(z.string().min(20, customMessage)).max(2),
        attributes: z.record(z.string(), z.number()),
      }).parse({
        items: Array.from({ length: 30 }, (_, index) => `secret-${index}`),
        attributes: { [submittedSecret]: "raw-secret-value" },
      });
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      requestId: expect.any(String),
    });
    expect(body.validation.issues.length).toBeLessThanOrEqual(16);
    expect(body.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: "field", code: "too_small" }),
      ]),
    );
    expect(body.validation.truncated).toBe(true);
    expect(serialized).not.toContain(submittedSecret);
    expect(serialized).not.toContain(customMessage);
    expect(serialized).not.toContain("raw-secret-value");
    expect(serialized).not.toContain("input");
    expect(serialized).not.toContain("cause");
  });

  it("preserves successful responses and adds the request ID header", async () => {
    const response = await executeTestRoute(
      () => Response.json({ ok: true }, { status: 201, headers: { "cache-control": "no-store" } }),
      { "x-request-id": "success-request" },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("success-request");
    expect(await response.json()).toEqual({ ok: true });
  });
});
