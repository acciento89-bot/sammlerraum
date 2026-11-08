import { BillingError } from "@sammlerraum/contracts/billing";
import {
  ApiError,
  type ApiErrorEnvelope,
  type ApiValidationErrorEnvelope,
  type ApiValidationIssue,
} from "@sammlerraum/contracts/errors";
import { ZodError } from "zod";

import { getRequestId } from "../request-id";

export type ApiRouteHandler<Args extends unknown[] = []> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>;

const MAX_VALIDATION_ISSUES = 16;
const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred";
const VALIDATION_ERROR_MESSAGE = "Request validation failed";
const responseHeaders = { "cache-control": "no-store" };

function errorResponse(
  error: ApiError,
  requestId: string,
  validation?: ApiValidationErrorEnvelope["validation"],
): Response {
  const envelope: ApiErrorEnvelope | ApiValidationErrorEnvelope = validation
    ? { error: { code: error.code, message: error.message, requestId }, validation }
    : { error: { code: error.code, message: error.message, requestId } };

  return Response.json(envelope, {
    status: error.status,
    headers: { ...responseHeaders, "x-request-id": requestId },
  });
}

function validationMetadata(error: ZodError): ApiValidationErrorEnvelope["validation"] {
  const issues: ApiValidationIssue[] = error.issues
    .slice(0, MAX_VALIDATION_ISSUES)
    .map((issue) => ({
      location: issue.path.length === 0 ? "request" : "field",
      code: issue.code,
    }));

  return { issues, truncated: error.issues.length > MAX_VALIDATION_ISSUES };
}

export function apiRoute<Args extends unknown[]>(
  handler: ApiRouteHandler<Args>,
): ApiRouteHandler<Args> {
  return async (request, ...args) => {
    const requestId = getRequestId(request.headers);

    try {
      const response = await handler(request, ...args);
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error, requestId);
      if (error instanceof BillingError) {
        const status =
          error.code === "BILLING_UNAVAILABLE"
            ? 503
            : error.code === "BILLING_NOT_FOUND"
              ? 404
              : error.code === "BILLING_INVALID_REQUEST"
                ? 400
                : error.code === "PLAN_LIMIT_REACHED" ||
                    error.code === "BILLING_CONFLICT" ||
                    error.code === "BILLING_EVENT_CONFLICT"
                  ? 409
                  : 403;
        return errorResponse(
          new ApiError(error.code, status, "This action is not currently available for this plan"),
          requestId,
        );
      }
      if (error instanceof ZodError) {
        return errorResponse(
          new ApiError("VALIDATION_ERROR", 400, VALIDATION_ERROR_MESSAGE),
          requestId,
          validationMetadata(error),
        );
      }
      return errorResponse(new ApiError("INTERNAL_ERROR", 500, INTERNAL_ERROR_MESSAGE), requestId);
    }
  };
}
