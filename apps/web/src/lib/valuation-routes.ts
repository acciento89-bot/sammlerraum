import { ApiError } from "@sammlerraum/contracts/errors";
import {
  ManualValuationInputSchema,
  ValuationIdSchema,
  ValuationQuerySchema,
  VALUATION_MAX_BODY_BYTES,
  VALUATION_MAX_QUERY_BYTES,
  VALUATION_MAX_RESPONSE_BYTES,
} from "@sammlerraum/contracts/valuations";
import {
  createValuationQuery,
  toManualValuationDto,
  ValuationQueryError,
  isValuationDependencyFailure,
  type ValuationQueryDatabase,
} from "@sammlerraum/domain/valuations/valuation-query";
import {
  createValuationService,
  ValuationServiceError,
  type ValuationDatabase,
} from "@sammlerraum/domain/valuations/valuation-service";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
/** Production omits display options. Trusted tests/activation composition can provide a verified policy. */
export function createValuationRouteDependencies(
  database: ValuationQueryDatabase & ValuationDatabase,
  auth: Authentication,
  appOrigin: string,
  display?: {
    policy: Parameters<typeof createValuationQuery>[1];
    registry: Parameters<typeof createValuationQuery>[2];
  },
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    query: createValuationQuery(database, display?.policy, display?.registry),
    service: (actor: string) => createValuationService(database, actor),
  };
}
function mapped(error: unknown): never {
  if (error instanceof ValuationQueryError || error instanceof ValuationServiceError) {
    if (["ITEM_NOT_FOUND", "SOURCE_NOT_FOUND"].includes(error.code))
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    if (error.code === "VALUATION_INVALID")
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid valuation request");
    if (error.code === "VALUATION_UNAVAILABLE")
      throw new ApiError(error.code, 503, "Valuation is temporarily unavailable");
    if (error.code === "VALUATION_INVARIANT")
      throw new ApiError("INTERNAL_ERROR", 500, "An unexpected error occurred");
    throw new ApiError(error.code, 409, "Valuation request cannot be applied");
  }
  if (isValuationDependencyFailure(error))
    throw new ApiError("VALUATION_UNAVAILABLE", 503, "Valuation is temporarily unavailable");
  throw error;
}
function id(value: string) {
  const p = ValuationIdSchema.safeParse(value);
  if (!p.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return p.data;
}
function query(request: Request) {
  const url = new URL(request.url);
  if (Buffer.byteLength(url.search) > VALUATION_MAX_QUERY_BYTES)
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid valuation query");
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(values, key))
      throw new ApiError("VALIDATION_ERROR", 400, "Duplicate query field");
    Object.defineProperty(values, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return ValuationQuerySchema.parse(values);
}
async function body(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, VALUATION_MAX_BODY_BYTES),
      ),
    ) as unknown;
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
function response(value: unknown, status = 200) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > VALUATION_MAX_RESPONSE_BYTES)
    throw new ApiError("INTERNAL_ERROR", 500, "An unexpected error occurred");
  return new Response(serialized, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
export function createValuationRouteHandlers(
  dependencies: ReturnType<typeof createValuationRouteDependencies>,
) {
  async function actor(request: Request, mutation: boolean) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return session.user.id;
  }
  return {
    GET: apiRoute(async (request, itemId: string) => {
      try {
        const userId = await actor(request, false),
          item = id(itemId),
          options = query(request);
        if (options.view === "source-history")
          return response({
            sourceHistory: await dependencies.query.getItemValuationSourceHistory(
              item,
              { userId },
              options,
            ),
          });
        return response({
          summary: await dependencies.query.getItemValuationSummary(item, { userId }, options),
        });
      } catch (error) {
        mapped(error);
      }
    }),
    POST: apiRoute(async (request, itemId: string) => {
      try {
        const userId = await actor(request, true),
          item = id(itemId);
        if (new URL(request.url).search)
          throw new ApiError("VALIDATION_ERROR", 400, "POST does not accept query fields");
        const input = ManualValuationInputSchema.parse(await body(request));
        const row = await dependencies
          .service(userId)
          .addManualValuation(item, { ...input, amountMinor: BigInt(input.amountMinor) });
        return response({ valuation: toManualValuationDto(row) }, 201);
      } catch (error) {
        mapped(error);
      }
    }),
  };
}
