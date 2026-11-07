import { z } from "zod";
import { ApiError } from "@sammlerraum/contracts/errors";
import { ShareError } from "@sammlerraum/contracts/sharing";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { SmartCollectionError } from "@sammlerraum/contracts/smart-collections";
import { parseItemFilterJson } from "@sammlerraum/contracts/search";
import { ItemSearchError, SEARCH_MAX_QUERY_BYTES } from "@sammlerraum/contracts/item-search";
import { parseScopedSearchRequestJson } from "@sammlerraum/contracts/scoped-search";
import { createScopedSearchService } from "@sammlerraum/domain/search/scoped-search-service";
import { createScopedSavedSearchService } from "@sammlerraum/domain/search/scoped-saved-search-service";
import { createScopedDiscoveryService } from "@sammlerraum/domain/search/scoped-discovery-service";
import { createScopedDashboardService } from "@sammlerraum/domain/dashboard/scoped-dashboard-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { mapItemSearchError, readSearchQueryMap } from "./item-search-routes";
import { apiRoute, type ApiRouteHandler } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";

type Database = Parameters<typeof createScopedSearchService>[0];
export function createScopedSearchRouteDependencies(
  database: Database,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
  money: { canonicalMoneyEnabled?: boolean } = {},
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    search: createScopedSearchService(database, money),
    saved: createScopedSavedSearchService(database, money),
    dashboard: createScopedDashboardService(database, money),
    discovery: createScopedDiscoveryService(database),
  };
}
function mapped(error: unknown): never {
  if (error instanceof ShareError) {
    const status =
      error.code === "SHARE_INVALID"
        ? 400
        : error.code === "SHARE_NOT_FOUND"
          ? 404
          : error.code === "SHARE_EXPIRED" || error.code === "SHARE_REVOKED"
            ? 410
            : error.code === "SHARE_PIN_REQUIRED" ||
                error.code === "SHARE_PIN_INVALID" ||
                error.code === "SHARE_FORBIDDEN"
              ? 403
              : error.code === "SHARE_RATE_LIMITED"
                ? 429
                : error.code === "SHARE_LIMIT_EXCEEDED"
                  ? 413
                  : error.code === "SHARE_UNAVAILABLE"
                    ? 503
                    : error.code === "SHARE_CONFLICT"
                      ? 409
                      : 500;
    throw new ApiError(error.code, status, "Shared selection is unavailable");
  }
  if (error instanceof MembershipError)
    throw new ApiError(
      error.code,
      error.code === "MEMBERSHIP_INVALID"
        ? 400
        : error.code === "MEMBERSHIP_UNAVAILABLE"
          ? 503
          : error.code === "MEMBERSHIP_INTEGRITY"
            ? 500
            : 404,
      "Collection is unavailable",
    );
  if (error instanceof SmartCollectionError)
    throw new ApiError(
      error.code,
      error.code === "SMART_COLLECTION_INVALID"
        ? 400
        : error.code === "SMART_COLLECTION_NOT_FOUND"
          ? 404
          : 409,
      "Saved query cannot be applied",
    );
  return mapItemSearchError(error);
}
function secure<Args extends unknown[]>(handler: ApiRouteHandler<Args>): ApiRouteHandler<Args> {
  const wrapped = apiRoute(handler);
  return async (request, ...args) => {
    const response = await wrapped(request, ...args),
      headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    if (response.status === 429) headers.set("retry-after", "900");
    return new Response(response.body, { status: response.status, headers });
  };
}
async function body(request: Request) {
  if (
    new URL(request.url).search ||
    new URL(request.url).hash ||
    !/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")
  )
    throw new ItemSearchError("SEARCH_INVALID");
  const bytes = await readBoundedBody(request, SEARCH_MAX_QUERY_BYTES);
  try {
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw Error();
    return parseScopedSearchRequestJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ItemSearchError("SEARCH_INVALID");
  }
}
const queryWire = z
  .object({
    text: z.string().optional(),
    f: z.string().nullable().optional(),
    lifecycle: z.string().optional(),
    limit: z.number().int().optional(),
    cursor: z.string().optional(),
  })
  .strict();
const searchWire = z.object({ target: z.unknown(), query: queryWire }).strict();
const savedMutationWire = z
  .object({ mutation: z.unknown(), access: z.unknown().optional() })
  .strict();
const savedResolveWire = z
  .object({ page: z.unknown().default({}), access: z.unknown().optional() })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ItemSearchError("SEARCH_INVALID");
  return parsed.data;
}
function query(input: z.infer<typeof queryWire>) {
  const { f, ...rest } = input;
  return { ...rest, ...(f !== undefined && f !== null ? { filter: parseItemFilterJson(f) } : {}) };
}
export function createScopedSearchRouteHandlers(
  dependencies: ReturnType<typeof createScopedSearchRouteDependencies>,
) {
  async function actor(request: Request, required: boolean, mutation = true) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (required && !session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return session ? { userId: session.user.id } : null;
  }
  const run = async (work: () => Promise<unknown>, status = 200) => {
    try {
      return Response.json(await work(), { status });
    } catch (error) {
      return mapped(error);
    }
  };
  const read = (dashboard: boolean) =>
    secure((request: Request) =>
      run(async () => {
        const who = await actor(request, false),
          input = parse(searchWire, await body(request));
        if (
          input.target &&
          typeof input.target === "object" &&
          "kind" in input.target &&
          input.target.kind === "MEMBER_COLLECTION" &&
          !who
        )
          throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        return dashboard
          ? dependencies.dashboard.get(who, input.target, query(input.query))
          : dependencies.search.search(who, input.target, query(input.query));
      }),
    );
  return {
    SEARCH: read(false),
    DASHBOARD: read(true),
    SCOPES: secure((request: Request) =>
      run(async () => {
        const who = await actor(request, true, false),
          values = readSearchQueryMap(request, ["family", "limit", "cursor"]);
        if (values.limit !== undefined && !/^[1-9][0-9]*$/u.test(values.limit))
          throw new ItemSearchError("SEARCH_INVALID");
        return dependencies.discovery.list(who!, {
          family: values.family,
          ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
        });
      }),
    ),
    SAVED_CREATE: secure((request: Request) =>
      run(async () => {
        const who = await actor(request, true),
          input = parse(savedMutationWire, await body(request));
        return dependencies.saved.create(who!, input.mutation, input.access);
      }, 201),
    ),
    SAVED_UPDATE: secure((request: Request, id: string) =>
      run(async () => {
        const who = await actor(request, true),
          input = parse(savedMutationWire, await body(request));
        return dependencies.saved.update(who!, id, input.mutation, input.access);
      }),
    ),
    SAVED_GET: secure((request: Request, id: string) =>
      run(async () => {
        const who = await actor(request, true, false);
        readSearchQueryMap(request, []);
        return dependencies.saved.get(who!, id);
      }),
    ),
    SAVED_LIST: secure((request: Request) =>
      run(async () => {
        const who = await actor(request, true, false),
          values = readSearchQueryMap(request, ["limit", "cursor"]);
        if (values.limit !== undefined && !/^[1-9][0-9]*$/u.test(values.limit))
          throw new ItemSearchError("SEARCH_INVALID");
        return dependencies.saved.list(who!, {
          ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
        });
      }),
    ),
    SAVED_RESOLVE: secure((request: Request, id: string) =>
      run(async () => {
        const who = await actor(request, true),
          input = parse(savedResolveWire, await body(request));
        return dependencies.saved.resolve(who!, id, input.page, input.access);
      }),
    ),
  };
}
