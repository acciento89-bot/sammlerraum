import {
  CATALOG_LINK_MAX_BODY_BYTES,
  CatalogLinkInputSchema,
  CatalogReadIdSchema,
} from "@sammlerraum/contracts/catalog-reads";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  createItemService,
  ItemServiceError,
  type ItemDatabase,
} from "@sammlerraum/domain/items/item-service";
import {
  CatalogReadError,
  createCatalogReadService,
} from "@sammlerraum/domain/catalog/catalog-read-service";
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
export function createCatalogLinkRouteDependencies(
  database: ItemDatabase & Parameters<typeof createCatalogReadService>[0],
  auth: Authentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createItemService: (actorId: string) => createItemService(database, actorId),
    reads: createCatalogReadService(database),
  };
}
function routeId(value: string) {
  const parsed = CatalogReadIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return parsed.data;
}
function query(request: Request, allowed: string[]) {
  const url = new URL(request.url);
  if (url.search.length > 8192) throw new ApiError("VALIDATION_ERROR", 400, "Query is too long");
  const result: Record<string, string | number> = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(result, key))
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid query parameters");
    result[key] = value;
  }
  if (result.limit !== undefined) {
    if (typeof result.limit !== "string" || !/^[1-9][0-9]?$/u.test(result.limit))
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid limit");
    result.limit = Number(result.limit);
  }
  return result;
}
async function body(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, CATALOG_LINK_MAX_BODY_BYTES),
      ),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
async function run(work: () => Promise<unknown>, key?: "item" | "link" | "entry" | "category") {
  try {
    const result = await work();
    return Response.json(key ? { [key]: result } : result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ItemServiceError || error instanceof CatalogReadError) {
      if (error.code.endsWith("NOT_FOUND"))
        throw new ApiError("NOT_FOUND", 404, "Resource not found");
      if (error.code === "CATALOG_QUERY_INVALID")
        throw new ApiError("VALIDATION_ERROR", 400, "Invalid catalog query");
      throw new ApiError(error.code, 409, "Catalog link cannot be changed in the current state");
    }
    throw error;
  }
}
export function createCatalogLinkRouteHandlers(
  dependencies: ReturnType<typeof createCatalogLinkRouteDependencies>,
) {
  async function actor(request: Request, mutation = false) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return session.user.id;
  }
  return {
    GET_LINK: apiRoute(async (request, itemId: string) => {
      const service = dependencies.createItemService(await actor(request));
      query(request, []);
      return run(() => service.getItemCatalogLink(routeId(itemId)), "link");
    }),
    PUT_LINK: apiRoute(async (request, itemId: string) => {
      const service = dependencies.createItemService(await actor(request, true));
      query(request, []);
      const input = CatalogLinkInputSchema.parse(await body(request));
      return run(
        () => service.linkItemToCatalog(routeId(itemId), input.entryId, input.variantId),
        "item",
      );
    }),
    DELETE_LINK: apiRoute(async (request, itemId: string) => {
      const service = dependencies.createItemService(await actor(request, true));
      query(request, []);
      if (request.body !== null) {
        await readBoundedBody(request, CATALOG_LINK_MAX_BODY_BYTES);
        throw new ApiError("VALIDATION_ERROR", 400, "DELETE does not accept a body");
      }
      return run(() => service.unlinkItemFromCatalog(routeId(itemId)), "item");
    }),
    SEARCH: apiRoute(async (request) => {
      await actor(request);
      const input = query(request, [
        "mode",
        "q",
        "categoryId",
        "namespace",
        "type",
        "limit",
        "cursor",
      ]);
      return run(() => dependencies.reads.searchCatalog(input));
    }),
    CATEGORIES: apiRoute(async (request) => {
      await actor(request);
      const input = query(request, ["limit", "cursor"]);
      return run(() => dependencies.reads.listCategories(input));
    }),
    CATEGORY: apiRoute(async (request, categoryId: string) => {
      await actor(request);
      query(request, []);
      return run(() => dependencies.reads.getCategoryTemplate(routeId(categoryId)), "category");
    }),
    ENTRY: apiRoute(async (request, entryId: string) => {
      await actor(request);
      query(request, []);
      return run(() => dependencies.reads.getCurrentCatalogEntry(routeId(entryId)), "entry");
    }),
  };
}
